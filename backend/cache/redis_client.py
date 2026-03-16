"""Redis caching layer using upstash-redis (HTTP-based) or aioredis.

All operations are wrapped in try/except -- cache failures never break
the application.  Every miss/hit is logged for observability.

If REDIS_URL is not set, every method is a no-op returning None.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

log = logging.getLogger("trashmy.cache")

# ---------------------------------------------------------------------------
# TTL constants (seconds)
# ---------------------------------------------------------------------------
TTL_ANALYSIS_LATEST = 604_800       # 7 days
TTL_REPORT = 604_800                # 7 days
TTL_PAGESPEED = 86_400              # 24 hours
TTL_OBSERVATORY = 604_800           # 7 days
TTL_CARBON = 2_592_000              # 30 days
TTL_FREE_USAGE = 2_592_000          # 30 days

_API_TTLS: dict[str, int] = {
    "pagespeed": TTL_PAGESPEED,
    "observatory": TTL_OBSERVATORY,
    "carbon": TTL_CARBON,
}

# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------
_redis: Any = None
_backend: Optional[str] = None  # "upstash" or "aioredis"


async def init_redis() -> bool:
    """Initialise the Redis client.  Returns True on success."""
    global _redis, _backend

    redis_url = os.getenv("REDIS_URL")
    redis_token = os.getenv("REDIS_TOKEN")

    if not redis_url:
        log.warning("REDIS_URL not set -- caching disabled")
        return False

    # Try Upstash REST client first (works over HTTPS, no TCP needed)
    if redis_token or redis_url.startswith("https://"):
        try:
            from upstash_redis.asyncio import Redis as UpstashRedis  # type: ignore
            _redis = UpstashRedis(url=redis_url, token=redis_token or "")
            _backend = "upstash"
            log.info("Upstash Redis connected (REST)")
            return True
        except ImportError:
            log.info("upstash-redis not installed, trying aioredis/redis")
        except Exception:
            log.exception("Failed to connect to Upstash Redis")

    # Fallback: aioredis / redis-py async
    try:
        import redis.asyncio as aioredis  # type: ignore
        _redis = aioredis.from_url(redis_url, decode_responses=True)
        await _redis.ping()
        _backend = "aioredis"
        log.info("aioredis connected (TCP)")
        return True
    except ImportError:
        log.warning("Neither upstash-redis nor redis[async] installed -- caching disabled")
        return False
    except Exception:
        log.exception("Failed to connect to Redis")
        return False


async def close_redis() -> None:
    """Close the Redis connection."""
    global _redis, _backend
    if _redis is not None and _backend == "aioredis":
        try:
            await _redis.close()
        except Exception:
            pass
    _redis = None
    _backend = None
    log.info("Redis connection closed")


def is_available() -> bool:
    """True when the Redis client is ready."""
    return _redis is not None


# ---------------------------------------------------------------------------
# CacheManager
# ---------------------------------------------------------------------------

class CacheManager:
    """Stateless cache operations.  All methods are class methods that use
    the module-level _redis client."""

    # -- Analysis cache --

    @staticmethod
    def _normalize_domain(domain: str) -> str:
        """Normalize a domain for consistent cache key generation."""
        d = domain.lower().strip()
        if d.startswith("www."):
            d = d[4:]
        # Strip trailing dots / slashes
        d = d.rstrip("./")
        return d

    @staticmethod
    async def get_cached_analysis(domain: str) -> Optional[str]:
        """Return the latest analysis UUID for a domain, or None."""
        if not is_available():
            return None
        domain = CacheManager._normalize_domain(domain)
        key = f"analysis:{domain}:latest"
        try:
            value = await _redis.get(key)
            if value:
                log.info("Cache HIT: %s", key)
                return str(value)
            log.info("Cache MISS: %s", key)
            return None
        except Exception:
            log.exception("Cache error reading %s", key)
            return None

    @staticmethod
    async def get_cached_analysis_report(domain: str) -> Optional[dict]:
        """Return the full cached report for a domain (Redis shortcut).

        Looks up the latest analysis UUID, then fetches the report for it.
        Returns None on miss.
        """
        analysis_id = await CacheManager.get_cached_analysis(domain)
        if not analysis_id:
            return None
        return await CacheManager.get_cached_report(analysis_id)

    @staticmethod
    async def cache_analysis(domain: str, analysis_id: str) -> None:
        """Store the latest analysis UUID for a domain."""
        if not is_available():
            return
        domain = CacheManager._normalize_domain(domain)
        key = f"analysis:{domain}:latest"
        try:
            await _redis.set(key, analysis_id, ex=TTL_ANALYSIS_LATEST)
            log.info("Cached %s = %s (TTL=%ds)", key, analysis_id, TTL_ANALYSIS_LATEST)
        except Exception:
            log.exception("Cache error writing %s", key)

    # -- Report cache --

    @staticmethod
    async def get_cached_report(analysis_id: str) -> Optional[dict]:
        """Return the full report JSON for an analysis, or None."""
        if not is_available():
            return None
        key = f"report:{analysis_id}"
        try:
            value = await _redis.get(key)
            if value:
                log.info("Cache HIT: %s", key)
                return json.loads(value) if isinstance(value, str) else value
            log.info("Cache MISS: %s", key)
            return None
        except Exception:
            log.exception("Cache error reading %s", key)
            return None

    @staticmethod
    async def cache_report(analysis_id: str, report: dict) -> None:
        """Store the full report JSON for an analysis."""
        if not is_available():
            return
        key = f"report:{analysis_id}"
        try:
            serialized = json.dumps(report, default=str)
            await _redis.set(key, serialized, ex=TTL_REPORT)
            log.info("Cached %s (TTL=%ds, size=%d bytes)", key, TTL_REPORT, len(serialized))
        except Exception:
            log.exception("Cache error writing %s", key)

    # -- External API result cache --

    @staticmethod
    async def get_cached_api_result(api_name: str, domain: str) -> Optional[dict]:
        """Return cached external API result, or None."""
        if not is_available():
            return None
        key = f"{api_name}:{domain}"
        try:
            value = await _redis.get(key)
            if value:
                log.info("Cache HIT: %s", key)
                return json.loads(value) if isinstance(value, str) else value
            log.info("Cache MISS: %s", key)
            return None
        except Exception:
            log.exception("Cache error reading %s", key)
            return None

    @staticmethod
    async def cache_api_result(api_name: str, domain: str, result: dict, ttl: Optional[int] = None) -> None:
        """Cache an external API result with the appropriate TTL."""
        if not is_available():
            return
        key = f"{api_name}:{domain}"
        effective_ttl = ttl or _API_TTLS.get(api_name, TTL_REPORT)
        try:
            serialized = json.dumps(result, default=str)
            await _redis.set(key, serialized, ex=effective_ttl)
            log.info("Cached %s (TTL=%ds)", key, effective_ttl)
        except Exception:
            log.exception("Cache error writing %s", key)

    # -- Free-tier usage tracking --

    @staticmethod
    async def cache_free_usage(ip_address: str) -> None:
        """Initialise the free-usage counter for an IP (set to 0 if not exists)."""
        if not is_available():
            return
        key = f"free_usage:{ip_address}"
        try:
            # Only set if the key does not already exist (NX)
            existing = await _redis.get(key)
            if existing is None:
                await _redis.set(key, "0", ex=TTL_FREE_USAGE)
                log.info("Initialised free usage counter for %s (TTL=%ds)", ip_address, TTL_FREE_USAGE)
        except Exception:
            log.exception("Cache error initialising free usage for %s", ip_address)

    @staticmethod
    async def check_free_usage(ip_address: str) -> int:
        """Return the number of analyses this IP has used on the free tier."""
        if not is_available():
            return 0
        key = f"free_usage:{ip_address}"
        try:
            value = await _redis.get(key)
            if value is not None:
                log.info("Free usage check for %s: %s", ip_address, value)
                return int(value)
            log.info("Free usage MISS for %s (no record)", ip_address)
            return 0
        except Exception:
            log.exception("Cache error reading free usage for %s", ip_address)
            return 0

    @staticmethod
    async def increment_free_usage(ip_address: str) -> int:
        """Increment the free-usage counter for an IP.  Returns the new count."""
        if not is_available():
            return 0
        key = f"free_usage:{ip_address}"
        try:
            # Use INCR which atomically creates + increments
            if _backend == "upstash":
                new_val = await _redis.incr(key)
            else:
                new_val = await _redis.incr(key)
            # Ensure TTL is set (INCR on a new key creates it without TTL)
            try:
                ttl = await _redis.ttl(key)
                if ttl is not None and int(ttl) < 0:
                    await _redis.expire(key, TTL_FREE_USAGE)
            except Exception:
                pass
            log.info("Incremented free usage for %s -> %s", ip_address, new_val)
            return int(new_val)
        except Exception:
            log.exception("Cache error incrementing free usage for %s", ip_address)
            return 0

    # -- Invalidation --

    @staticmethod
    async def invalidate_domain(domain: str) -> None:
        """Clear all caches for a domain."""
        if not is_available():
            return
        domain = CacheManager._normalize_domain(domain)
        keys_to_delete = [
            f"analysis:{domain}:latest",
            f"pagespeed:{domain}",
            f"observatory:{domain}",
            f"carbon:{domain}",
        ]
        # Also try to find and delete the report cache for the latest analysis
        try:
            latest_id = await _redis.get(f"analysis:{domain}:latest")
            if latest_id:
                keys_to_delete.append(f"report:{latest_id}")
        except Exception:
            pass

        for key in keys_to_delete:
            try:
                await _redis.delete(key)
                log.info("Invalidated cache key: %s", key)
            except Exception:
                log.exception("Failed to delete cache key: %s", key)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

async def health_check() -> dict:
    """Return a health status dict for Redis."""
    if not is_available():
        return {"status": "unavailable", "reason": "REDIS_URL not set or client not initialised"}
    try:
        if _backend == "upstash":
            # Upstash ping may differ
            await _redis.set("_health", "ok", ex=10)
            val = await _redis.get("_health")
            return {"status": "ok", "backend": "upstash"} if val else {"status": "error"}
        else:
            pong = await _redis.ping()
            return {"status": "ok", "backend": "aioredis"} if pong else {"status": "error"}
    except Exception as exc:
        return {"status": "error", "reason": str(exc)[:200]}
