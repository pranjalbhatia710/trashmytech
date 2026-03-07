"""OpenAI embedding generation for sites and issues.

Embedding generation is non-blocking -- if it fails the error is logged but
the calling code continues normally.  Uses batch embedding for efficiency.
Uses OpenAI text-embedding-3-small (1536 dimensions).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

log = logging.getLogger("trashmy.embedding")

_client = None


def _get_client():
    """Lazily initialise the OpenAI client."""
    global _client
    if _client is not None:
        return _client

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        log.warning("OPENAI_API_KEY not set -- embedding generation disabled")
        return None

    try:
        from openai import OpenAI
        _client = OpenAI(api_key=api_key)
        log.info("OpenAI client initialised for embeddings")
        return _client
    except ImportError:
        log.warning("openai package not installed -- embedding generation disabled")
        return None
    except Exception:
        log.exception("Failed to initialise OpenAI client")
        return None


# ---------------------------------------------------------------------------
# Core embedding function
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
MAX_BATCH_SIZE = 2048  # OpenAI batch limit


def is_available() -> bool:
    """Check if embedding generation is available."""
    return _get_client() is not None


async def generate_embeddings(texts: list[str]) -> list[Optional[list[float]]]:
    """Generate embeddings for a list of texts using Gemini.

    Returns a list of the same length as `texts`.  Each element is either
    a 1536-dim float list or None if that particular text failed.

    Uses batch embedding and handles rate limits with exponential backoff.
    """
    client = _get_client()
    if client is None:
        return [None] * len(texts)

    if not texts:
        return []

    results: list[Optional[list[float]]] = [None] * len(texts)

    # Process in batches
    for batch_start in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[batch_start:batch_start + MAX_BATCH_SIZE]

        # Clean / truncate texts
        cleaned = []
        for t in batch:
            t = (t or "").strip()
            if not t:
                t = "empty"
            # Truncate to stay under limits (~2048 tokens, ~8000 chars)
            if len(t) > 8000:
                t = t[:8000]
            cleaned.append(t)

        for attempt in range(3):
            try:
                response = await asyncio.to_thread(
                    client.embeddings.create,
                    model=EMBEDDING_MODEL,
                    input=cleaned,
                )
                for i, emb_obj in enumerate(response.data):
                    idx = batch_start + i
                    results[idx] = emb_obj.embedding
                log.info(
                    "Generated %d embeddings (batch %d-%d)",
                    len(batch), batch_start, batch_start + len(batch),
                )
                break
            except Exception as exc:
                wait = 2 ** attempt
                log.warning(
                    "Embedding batch %d-%d attempt %d failed: %s (retrying in %ds)",
                    batch_start, batch_start + len(batch),
                    attempt + 1, str(exc)[:150], wait,
                )
                if attempt < 2:
                    await asyncio.sleep(wait)
                else:
                    log.error(
                        "Embedding batch %d-%d failed after 3 attempts",
                        batch_start, batch_start + len(batch),
                    )

    return results


# ---------------------------------------------------------------------------
# High-level helpers
# ---------------------------------------------------------------------------

async def generate_site_embedding(
    domain: str,
    category: Optional[str],
    overall_score: Optional[float],
    report_summary: str,
) -> Optional[list[float]]:
    """Generate a single embedding for a site record."""
    parts = [f"Website: {domain}"]
    if category:
        parts.append(f"Category: {category}")
    if overall_score is not None:
        parts.append(f"Score: {overall_score}/100")
    if report_summary:
        parts.append(report_summary[:5000])
    text = " | ".join(parts)

    results = await generate_embeddings([text])
    return results[0] if results else None


async def generate_issue_embeddings(
    issues: list[dict],
) -> list[Optional[list[float]]]:
    """Generate embeddings for a list of issue dicts."""
    texts = []
    for issue in issues:
        parts = [
            issue.get("title", ""),
            issue.get("description", issue.get("detail", "")),
            f"Type: {issue.get('type', 'unknown')}",
            f"Severity: {issue.get('severity', 'medium')}",
        ]
        texts.append(" | ".join(p for p in parts if p))

    return await generate_embeddings(texts)


async def update_site_embedding(site_id, embedding: list[float]) -> None:
    """Store a pre-computed embedding on the sites table."""
    from db.connection import get_pool
    from db.connection import is_available as db_available
    if not db_available() or embedding is None:
        return
    pool = get_pool()
    try:
        async with pool.acquire() as conn:  # type: ignore[union-attr]
            await conn.execute(
                "UPDATE sites SET embedding = $1 WHERE id = $2",
                embedding, site_id,
            )
            log.info("Updated embedding for site %s", site_id)
    except Exception:
        log.exception("Failed to update site embedding for %s", site_id)


async def update_issue_embeddings(
    analysis_id, issue_embeddings: list[tuple[str, list[float]]]
) -> None:
    """Store pre-computed embeddings on issues."""
    from db.connection import get_pool
    from db.connection import is_available as db_available
    if not db_available() or not issue_embeddings:
        return
    pool = get_pool()
    try:
        async with pool.acquire() as conn:  # type: ignore[union-attr]
            for title, emb in issue_embeddings:
                if emb is not None:
                    await conn.execute(
                        """
                        UPDATE issues SET embedding = $1
                        WHERE analysis_id = $2 AND title = $3 AND embedding IS NULL
                        """,
                        emb, analysis_id, title[:500],
                    )
            log.info("Updated %d issue embeddings for analysis %s", len(issue_embeddings), analysis_id)
    except Exception:
        log.exception("Failed to update issue embeddings for analysis %s", analysis_id)
