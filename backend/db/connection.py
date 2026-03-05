"""Async PostgreSQL connection pool using asyncpg.

The pool is lazily initialised on first use and shut down via the FastAPI
lifespan hook.  If DATABASE_URL is not set every public function is a no-op
so the rest of the application keeps working without a database.
"""

from __future__ import annotations

import logging
import os
import pathlib
from typing import Optional

import asyncpg  # type: ignore

log = logging.getLogger("trashmy.db")

_pool: Optional[asyncpg.Pool] = None

# ---------------------------------------------------------------------------
# Pool lifecycle
# ---------------------------------------------------------------------------

async def init_pool() -> Optional[asyncpg.Pool]:
    """Create the connection pool.  Returns None when DATABASE_URL is unset."""
    global _pool

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        log.warning("DATABASE_URL not set -- database persistence disabled")
        return None

    try:
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=2,
            max_size=10,
            command_timeout=30,
            statement_cache_size=100,
        )
        log.info("PostgreSQL connection pool created (min=2, max=10)")

        # Install pgvector codec so asyncpg can send/receive vector columns
        async with _pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            # Register the vector type for this connection (pool will inherit)
            await _register_vector_type(conn)

        return _pool
    except Exception:
        log.exception("Failed to create PostgreSQL connection pool")
        _pool = None
        return None


async def _register_vector_type(conn: asyncpg.Connection) -> None:
    """Register pgvector's vector type with asyncpg so it can encode/decode."""
    try:
        # pgvector stores vectors as text like '[0.1,0.2,...]'
        # We register a custom codec to handle this transparently.
        await conn.set_type_codec(
            "vector",
            encoder=_vector_encoder,
            decoder=_vector_decoder,
            schema="public",
            format="text",
        )
    except Exception:
        # If vector type isn't available yet, skip -- embeddings will just fail gracefully
        log.warning("Could not register pgvector type codec (extension may not be installed)")


def _vector_encoder(value: list[float] | str) -> str:
    """Encode a Python list of floats to pgvector text format."""
    if isinstance(value, str):
        return value
    return "[" + ",".join(str(v) for v in value) + "]"


def _vector_decoder(value: str) -> list[float]:
    """Decode pgvector text format to a Python list of floats."""
    return [float(x) for x in value.strip("[]").split(",")]


async def close_pool() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        log.info("PostgreSQL connection pool closed")


def get_pool() -> Optional[asyncpg.Pool]:
    """Return the current pool (may be None)."""
    return _pool


def is_available() -> bool:
    """True when the database pool is initialised and usable."""
    return _pool is not None


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------

async def run_migrations() -> None:
    """Execute all numbered SQL migration files in order.

    Each file is run inside a transaction.  Files that have already been
    applied (tables/extensions exist) are idempotent because they use
    CREATE ... IF NOT EXISTS.
    """
    if not is_available():
        return

    migrations_dir = pathlib.Path(__file__).parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    if not sql_files:
        log.warning("No migration files found in %s", migrations_dir)
        return

    async with _pool.acquire() as conn:  # type: ignore[union-attr]
        for sql_file in sql_files:
            try:
                sql = sql_file.read_text()
                await conn.execute(sql)
                log.info("Migration applied: %s", sql_file.name)
            except Exception:
                log.exception("Migration failed: %s", sql_file.name)
                raise


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

async def health_check() -> dict:
    """Return a health status dict for the database."""
    if not is_available():
        return {"status": "unavailable", "reason": "DATABASE_URL not set or pool not initialised"}

    try:
        async with _pool.acquire() as conn:  # type: ignore[union-attr]
            row = await conn.fetchval("SELECT 1")
            pool_size = _pool.get_size()  # type: ignore[union-attr]
            pool_free = _pool.get_idle_size()  # type: ignore[union-attr]
        return {
            "status": "ok",
            "pool_size": pool_size,
            "pool_free": pool_free,
        }
    except Exception as exc:
        return {"status": "error", "reason": str(exc)[:200]}
