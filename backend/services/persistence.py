"""Persistence orchestrator.

Takes a completed report + raw session data and stores everything in
PostgreSQL, updates Redis caches, and triggers background embedding
generation.

This module is the single entry point for "save everything after an
analysis completes".  It is designed to never throw -- all errors are
logged and swallowed so the main WebSocket pipeline is never interrupted.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional
from urllib.parse import urlparse

log = logging.getLogger("trashmy.persistence")


def normalize_domain(url: str) -> str:
    """Extract a clean domain from a URL (no scheme, no port, no www.)."""
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path.split("/")[0]
    # Strip port
    if ":" in domain:
        domain = domain.split(":")[0]
    # Strip www.
    if domain.startswith("www."):
        domain = domain[4:]
    return domain.lower()


def _extract_scores(report: dict) -> dict[str, Optional[float]]:
    """Pull category scores out of a report dict."""
    cats = report.get("category_scores", {})
    return {
        "overall_score": report.get("score", {}).get("overall"),
        "accessibility_score": _cat_score(cats, "accessibility"),
        "seo_score": _cat_score(cats, "ai_readability"),
        "performance_score": _cat_score(cats, "performance"),
        "security_score": _cat_score(cats, "security"),
        "content_score": _cat_score(cats, "usability"),
        "ux_score": _cat_score(cats, "mobile"),
    }


def _cat_score(cats: dict, key: str) -> Optional[float]:
    entry = cats.get(key)
    if isinstance(entry, dict):
        return entry.get("score")
    return None


def _extract_issues(report: dict) -> list[dict]:
    """Normalise issues from the report's whats_broken / narrative."""
    issues: list[dict] = []
    narrative = report.get("narrative", {})

    for item in narrative.get("top_issues", []) + narrative.get("what_doesnt_work", []):
        severity = str(item.get("severity", "MEDIUM")).upper()
        issues.append({
            "title": item.get("title", "Untitled"),
            "description": item.get("description", ""),
            "severity": severity,
            "type": _guess_type(item),
            "page_url": item.get("page_url"),
            "element": item.get("element"),
        })

    # De-duplicate by title
    seen = set()
    unique = []
    for issue in issues:
        title_key = issue["title"].lower().strip()
        if title_key not in seen:
            seen.add(title_key)
            unique.append(issue)

    return unique


def _guess_type(item: dict) -> str:
    """Guess the issue type from its content."""
    title = (item.get("title", "") + " " + item.get("description", "")).lower()
    if any(w in title for w in ("alt text", "aria", "screen reader", "contrast", "wcag", "a11y", "accessibility")):
        return "a11y"
    if any(w in title for w in ("seo", "meta", "sitemap", "robots", "structured data", "json-ld")):
        return "seo"
    if any(w in title for w in ("slow", "load time", "performance", "bundle", "render")):
        return "performance"
    if any(w in title for w in ("security", "https", "ssl", "xss", "csrf", "header")):
        return "security"
    if any(w in title for w in ("content", "text", "copy", "readability")):
        return "content"
    return "ux"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def persist_analysis(
    url: str,
    report: dict,
    sessions: list[dict],
    crawl_data: dict,
    execution_time_seconds: Optional[float] = None,
    user_id: Optional[str] = None,
    analysis_mode: str = "standard",
) -> Optional[str]:
    """Store a completed analysis.  Returns the analysis UUID string or None.

    This function never raises.  All errors are logged and swallowed.

    Parameters
    ----------
    user_id : optional UUID string of the authenticated user
    analysis_mode : 'fast', 'standard', or 'deep'
    """
    from db.connection import is_available as db_available
    from cache.redis_client import is_available as cache_available

    if not db_available() and not cache_available():
        log.info("Neither database nor cache available -- skipping persistence")
        return None

    domain = normalize_domain(url)
    scores = _extract_scores(report)
    issues = _extract_issues(report)
    analysis_id: Optional[str] = None

    # Convert user_id string to UUID if provided
    from uuid import UUID as _UUID
    uid: Optional[_UUID] = None
    if user_id:
        try:
            uid = _UUID(user_id)
        except (ValueError, TypeError):
            log.warning("Invalid user_id '%s' -- persisting without user", user_id)

    # ── 1. Database persistence ──────────────────────────────────
    if db_available():
        try:
            analysis_id = await _persist_to_db(
                url, domain, scores, issues, report, sessions,
                crawl_data, execution_time_seconds,
                user_id=uid,
                analysis_mode=analysis_mode,
            )
        except Exception:
            log.exception("Database persistence failed for %s", domain)

    # ── 2. Redis cache update ────────────────────────────────────
    if cache_available() and analysis_id:
        try:
            await _update_cache(domain, analysis_id, report)
        except Exception:
            log.exception("Cache update failed for %s", domain)

    # ── 3. Background embedding generation ───────────────────────
    if analysis_id:
        # Fire-and-forget: don't await, don't let failures propagate
        asyncio.create_task(
            _generate_embeddings_safe(analysis_id, domain, scores, report, issues)
        )

    return analysis_id


async def _persist_to_db(
    url: str,
    domain: str,
    scores: dict,
    issues: list[dict],
    report: dict,
    sessions: list[dict],
    crawl_data: dict,
    execution_time_seconds: Optional[float],
    user_id: Optional[Any] = None,
    analysis_mode: str = "standard",
) -> Optional[str]:
    """Write everything to PostgreSQL inside a logical transaction group."""
    from db import queries

    # Strip base64 screenshots from report before storing as JSONB
    report_for_storage = _strip_screenshots(report)

    # 1. Upsert site
    site_id = await queries.upsert_site(
        url=url,
        domain=domain,
        **scores,
    )
    if site_id is None:
        return None

    # 2. Insert analysis
    analysis_id = await queries.insert_analysis(
        site_id,
        **scores,
        total_issues=len(issues),
        critical_issues=sum(1 for i in issues if i.get("severity", "").upper() == "CRITICAL"),
        execution_time_seconds=execution_time_seconds,
        report_json=report_for_storage,
        site_map_json=crawl_data.get("site_map"),
        analysis_mode=analysis_mode,
        user_id=user_id,
    )
    if analysis_id is None:
        return None

    # 3. Insert persona sessions
    await queries.insert_persona_sessions(analysis_id, site_id, sessions)

    # 4. Insert issues
    await queries.insert_issues(analysis_id, site_id, issues)

    # 5. Insert SEO snapshot
    await queries.insert_seo_snapshot(analysis_id, site_id, crawl_data)

    log.info(
        "Persisted analysis %s for %s (issues=%d, sessions=%d)",
        analysis_id, domain, len(issues), len(sessions),
    )
    return str(analysis_id)


def _strip_screenshots(report: dict) -> dict:
    """Return a deep copy of the report with base64 screenshot data removed.

    We don't want to store megabytes of base64 in the JSONB column.
    """
    cleaned = json.loads(json.dumps(report, default=str))

    # Remove the annotated screenshot
    cleaned.pop("annotated_screenshot_b64", None)

    # Remove per-session screenshot b64 data
    for session in cleaned.get("sessions_summary", []):
        for ss in session.get("screenshots", []):
            ss.pop("screenshot_b64", None)

    return cleaned


async def _update_cache(domain: str, analysis_id: str, report: dict) -> None:
    """Update Redis caches after a successful database write."""
    from cache.redis_client import CacheManager

    await CacheManager.cache_analysis(domain, analysis_id)

    # Cache a lightweight version of the report (no screenshots)
    report_for_cache = _strip_screenshots(report)
    await CacheManager.cache_report(analysis_id, report_for_cache)


async def _generate_embeddings_safe(
    analysis_id: str,
    domain: str,
    scores: dict,
    report: dict,
    issues: list[dict],
) -> None:
    """Generate and store embeddings.  Never raises."""
    try:
        from services.embedding import (
            generate_site_embedding,
            generate_issue_embeddings,
            update_site_embedding,
            update_issue_embeddings,
        )
        from uuid import UUID

        # Site embedding
        summary = report.get("narrative", {}).get("executive_summary", "")
        site_emb = await generate_site_embedding(
            domain=domain,
            category=None,
            overall_score=scores.get("overall_score"),
            report_summary=summary,
        )
        if site_emb:
            # We need the site_id; look it up
            from db.queries import get_site_by_domain
            site = await get_site_by_domain(domain)
            if site:
                await update_site_embedding(site["id"], site_emb)

        # Issue embeddings
        if issues:
            embeddings = await generate_issue_embeddings(issues)
            pairs = [
                (issues[i]["title"][:500], embeddings[i])
                for i in range(len(issues))
                if embeddings[i] is not None
            ]
            if pairs:
                await update_issue_embeddings(UUID(analysis_id), pairs)

        log.info("Embedding generation complete for %s", domain)
    except Exception:
        log.exception("Embedding generation failed for %s (non-fatal)", domain)
