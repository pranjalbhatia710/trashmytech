"""All database query functions.  Every function is async and uses
parameterised queries via asyncpg.

All public functions return None / empty results when the database pool
is not available, so callers never need to guard with ``if is_available()``.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from db.connection import get_pool, is_available

log = logging.getLogger("trashmy.db.queries")

# ---------------------------------------------------------------------------
# Sites
# ---------------------------------------------------------------------------

async def upsert_site(
    url: str,
    domain: str,
    *,
    category: Optional[str] = None,
    overall_score: Optional[float] = None,
    accessibility_score: Optional[float] = None,
    seo_score: Optional[float] = None,
    performance_score: Optional[float] = None,
    security_score: Optional[float] = None,
    content_score: Optional[float] = None,
    ux_score: Optional[float] = None,
    embedding: Optional[list[float]] = None,
) -> Optional[UUID]:
    """Insert a new site or update an existing one.  Returns the site UUID."""
    if not is_available():
        return None

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            INSERT INTO sites (
                url, domain, category,
                latest_overall_score, latest_accessibility_score,
                latest_seo_score, latest_performance_score,
                latest_security_score, latest_content_score,
                latest_ux_score, embedding
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (domain) DO UPDATE SET
                url = EXCLUDED.url,
                category = COALESCE(EXCLUDED.category, sites.category),
                last_analyzed = now(),
                analysis_count = sites.analysis_count + 1,
                latest_overall_score = EXCLUDED.latest_overall_score,
                latest_accessibility_score = EXCLUDED.latest_accessibility_score,
                latest_seo_score = EXCLUDED.latest_seo_score,
                latest_performance_score = EXCLUDED.latest_performance_score,
                latest_security_score = EXCLUDED.latest_security_score,
                latest_content_score = EXCLUDED.latest_content_score,
                latest_ux_score = EXCLUDED.latest_ux_score,
                embedding = COALESCE(EXCLUDED.embedding, sites.embedding)
            RETURNING id
            """,
            url, domain, category,
            overall_score, accessibility_score,
            seo_score, performance_score,
            security_score, content_score,
            ux_score, embedding,
        )
        site_id = row["id"]
        log.info("Upserted site %s (domain=%s)", site_id, domain)
        return site_id


async def get_site_by_domain(domain: str) -> Optional[dict]:
    """Fetch a site record by domain."""
    if not is_available():
        return None

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            "SELECT * FROM sites WHERE domain = $1", domain
        )
        return dict(row) if row else None


async def get_recent_sites(limit: int = 20) -> list[dict]:
    """Return the most recently analyzed sites."""
    if not is_available():
        return []

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        rows = await conn.fetch(
            """
            SELECT domain, url, latest_overall_score, last_analyzed,
                   analysis_count, category
            FROM sites
            ORDER BY last_analyzed DESC
            LIMIT $1
            """,
            limit,
        )
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Analyses
# ---------------------------------------------------------------------------

async def insert_analysis(
    site_id: UUID,
    *,
    overall_score: Optional[float] = None,
    accessibility_score: Optional[float] = None,
    seo_score: Optional[float] = None,
    performance_score: Optional[float] = None,
    security_score: Optional[float] = None,
    content_score: Optional[float] = None,
    ux_score: Optional[float] = None,
    total_issues: int = 0,
    critical_issues: int = 0,
    execution_time_seconds: Optional[float] = None,
    report_json: Optional[dict] = None,
    site_map_json: Optional[dict] = None,
    external_api_data: Optional[dict] = None,
) -> Optional[UUID]:
    """Insert an analysis row.  Returns the analysis UUID."""
    if not is_available():
        return None

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            INSERT INTO analyses (
                site_id, overall_score, accessibility_score, seo_score,
                performance_score, security_score, content_score, ux_score,
                total_issues, critical_issues, execution_time_seconds,
                report_json, site_map_json, external_api_data
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING id
            """,
            site_id,
            overall_score, accessibility_score, seo_score,
            performance_score, security_score, content_score, ux_score,
            total_issues, critical_issues, execution_time_seconds,
            json.dumps(report_json, default=str) if report_json else None,
            json.dumps(site_map_json, default=str) if site_map_json else None,
            json.dumps(external_api_data, default=str) if external_api_data else None,
        )
        analysis_id = row["id"]
        log.info("Inserted analysis %s for site %s", analysis_id, site_id)
        return analysis_id


async def get_analysis_by_id(analysis_id: UUID) -> Optional[dict]:
    """Fetch a single analysis with its site domain."""
    if not is_available():
        return None

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            SELECT a.*, s.domain
            FROM analyses a
            JOIN sites s ON a.site_id = s.id
            WHERE a.id = $1
            """,
            analysis_id,
        )
        if not row:
            return None
        result = dict(row)
        # Parse JSONB fields
        for key in ("report_json", "site_map_json", "external_api_data"):
            if result.get(key) and isinstance(result[key], str):
                result[key] = json.loads(result[key])
        return result


async def get_latest_analysis_for_domain(
    domain: str, max_age_days: int = 7
) -> Optional[dict]:
    """Return the most recent analysis for a domain within the cache window."""
    if not is_available():
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            SELECT a.*, s.domain
            FROM analyses a
            JOIN sites s ON a.site_id = s.id
            WHERE s.domain = $1 AND a.created_at >= $2
            ORDER BY a.created_at DESC
            LIMIT 1
            """,
            domain, cutoff,
        )
        if not row:
            return None
        result = dict(row)
        for key in ("report_json", "site_map_json", "external_api_data"):
            if result.get(key) and isinstance(result[key], str):
                result[key] = json.loads(result[key])
        return result


async def get_analyses_for_site(
    site_id: UUID, *, page: int = 1, limit: int = 10
) -> tuple[list[dict], int]:
    """Return paginated analyses for a site.  Returns (rows, total_count)."""
    if not is_available():
        return [], 0

    offset = (page - 1) * limit
    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM analyses WHERE site_id = $1", site_id
        )
        rows = await conn.fetch(
            """
            SELECT id, site_id, created_at, overall_score,
                   accessibility_score, seo_score, performance_score,
                   security_score, content_score, ux_score,
                   total_issues, critical_issues, execution_time_seconds
            FROM analyses
            WHERE site_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            site_id, limit, offset,
        )
        return [dict(r) for r in rows], total


# ---------------------------------------------------------------------------
# Persona sessions
# ---------------------------------------------------------------------------

async def insert_persona_sessions(
    analysis_id: UUID,
    site_id: UUID,
    sessions: list[dict[str, Any]],
) -> int:
    """Bulk-insert persona session records.  Returns count inserted."""
    if not is_available() or not sessions:
        return 0

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        records = []
        for s in sessions:
            persona = s.get("persona", {})
            records.append((
                analysis_id,
                site_id,
                persona.get("id", s.get("agent_id", "")),
                persona.get("name", ""),
                persona.get("category", ""),
                s.get("task_completed", False),
                s.get("errors", [None])[0] if s.get("errors") else None,
                (s.get("total_time_ms", 0) or 0) / 1000.0,
                len(set(
                    step.get("page_url_after", "")
                    for step in s.get("steps", [])
                    if step.get("page_url_after")
                )),
                s.get("steps_taken", len(s.get("steps", []))),
                json.dumps(s.get("steps", [])[:30], default=str),
                s.get("screenshots_urls", []),
            ))

        await conn.executemany(
            """
            INSERT INTO persona_sessions (
                analysis_id, site_id, persona_id, persona_name,
                persona_category, task_completed, failure_reason,
                time_spent_seconds, pages_visited, actions_taken,
                session_log, screenshots
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            """,
            records,
        )
        log.info("Inserted %d persona sessions for analysis %s", len(records), analysis_id)
        return len(records)


# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------

_SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "major": "high",
    "minor": "low",
}

_TYPE_MAP = {
    "accessibility": "a11y",
    "a11y": "a11y",
    "ux": "ux",
    "usability": "ux",
    "seo": "seo",
    "content": "content",
    "performance": "performance",
    "security": "security",
}


async def insert_issues(
    analysis_id: UUID,
    site_id: UUID,
    issues: list[dict[str, Any]],
) -> int:
    """Bulk-insert issue records.  Returns count inserted."""
    if not is_available() or not issues:
        return 0

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        records = []
        for issue in issues:
            severity_raw = str(issue.get("severity", "medium")).lower()
            severity = _SEVERITY_MAP.get(severity_raw, "medium")

            type_raw = str(issue.get("type", issue.get("category", "ux"))).lower()
            issue_type = _TYPE_MAP.get(type_raw, "ux")

            records.append((
                analysis_id,
                site_id,
                issue.get("persona_id"),
                issue_type,
                severity,
                issue.get("title", "Untitled issue")[:500],
                issue.get("description", issue.get("detail", ""))[:2000],
                issue.get("page_url"),
                issue.get("element"),
                issue.get("screenshot"),
                issue.get("issue_category"),
                issue.get("seo_impact"),
            ))

        await conn.executemany(
            """
            INSERT INTO issues (
                analysis_id, site_id, persona_id, type, severity,
                title, description, page_url, element, screenshot,
                issue_category, seo_impact
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            """,
            records,
        )
        log.info("Inserted %d issues for analysis %s", len(records), analysis_id)
        return len(records)


# ---------------------------------------------------------------------------
# SEO snapshots
# ---------------------------------------------------------------------------

async def insert_seo_snapshot(
    analysis_id: UUID,
    site_id: UUID,
    crawl_data: dict[str, Any],
) -> Optional[UUID]:
    """Extract SEO-relevant data from crawl_data and insert a snapshot."""
    if not is_available():
        return None

    seo = crawl_data.get("seo", {})
    ai_seo = crawl_data.get("ai_seo", {})
    images = crawl_data.get("images", {})
    if not isinstance(images, dict):
        images = {}
    heading = crawl_data.get("heading_hierarchy", {})
    links = crawl_data.get("links", [])

    total_images = images.get("total", 0)
    missing_alt = images.get("missing_alt", 0)
    alt_coverage = ((total_images - missing_alt) / total_images * 100.0) if total_images > 0 else None

    # Count internal vs external links
    from urllib.parse import urlparse
    site_host = urlparse(crawl_data.get("url", "")).netloc
    internal = sum(1 for l in links if urlparse(l.get("href", "")).netloc in ("", site_host))
    external = len(links) - internal

    # Extract OG/Twitter/JSON-LD from ai_seo checks if available
    og_tags = None
    json_ld = None
    for check in ai_seo.get("checks", []):
        name = check.get("name", "").lower()
        if "open graph" in name and check.get("status") == "pass":
            og_tags = check.get("details")
        if "json-ld" in name or "structured data" in name:
            json_ld = check.get("details")

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            INSERT INTO seo_snapshots (
                analysis_id, site_id,
                viewport_meta, title_tag, title_length,
                meta_description, meta_desc_length,
                h1_tag, h1_count, heading_hierarchy_valid,
                heading_structure, og_tags, json_ld,
                full_load_ms,
                internal_links_count, external_links_count,
                image_alt_coverage
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING id
            """,
            analysis_id, site_id,
            seo.get("has_viewport"),
            crawl_data.get("title"),
            len(crawl_data.get("title", "") or ""),
            seo.get("meta_description"),
            len(seo.get("meta_description", "") or ""),
            seo.get("h1_text"),
            1 if seo.get("has_h1") else 0,
            heading.get("valid"),
            json.dumps(heading, default=str) if heading else None,
            json.dumps(og_tags, default=str) if og_tags else None,
            json.dumps(json_ld, default=str) if json_ld else None,
            crawl_data.get("page_load_time_ms"),
            internal, external,
            alt_coverage,
        )
        snapshot_id = row["id"]
        log.info("Inserted SEO snapshot %s for analysis %s", snapshot_id, analysis_id)
        return snapshot_id


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

async def get_stats() -> dict:
    """Aggregate stats across all data."""
    if not is_available():
        return {"total_sites": 0, "total_analyses": 0, "total_issues": 0, "avg_score": None}

    pool = get_pool()
    async with pool.acquire() as conn:  # type: ignore[union-attr]
        row = await conn.fetchrow(
            """
            SELECT
                (SELECT COUNT(*) FROM sites) AS total_sites,
                (SELECT COUNT(*) FROM analyses) AS total_analyses,
                (SELECT COUNT(*) FROM issues) AS total_issues,
                (SELECT ROUND(AVG(latest_overall_score)::numeric, 1)
                 FROM sites
                 WHERE latest_overall_score IS NOT NULL) AS avg_score
            """
        )
        return dict(row) if row else {
            "total_sites": 0, "total_analyses": 0,
            "total_issues": 0, "avg_score": None,
        }
