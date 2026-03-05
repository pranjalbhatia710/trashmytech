"""Pydantic models for database records and API responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Database record models
# ---------------------------------------------------------------------------

class SiteRecord(BaseModel):
    """A row from the sites table."""
    id: UUID
    url: str
    domain: str
    category: Optional[str] = None
    first_analyzed: datetime
    last_analyzed: datetime
    analysis_count: int = 1
    latest_overall_score: Optional[float] = None
    latest_accessibility_score: Optional[float] = None
    latest_seo_score: Optional[float] = None
    latest_performance_score: Optional[float] = None
    latest_security_score: Optional[float] = None
    latest_content_score: Optional[float] = None
    latest_ux_score: Optional[float] = None


class AnalysisSummary(BaseModel):
    """Lightweight analysis record returned in lists (no full report JSON)."""
    id: UUID
    site_id: UUID
    created_at: datetime
    overall_score: Optional[float] = None
    accessibility_score: Optional[float] = None
    seo_score: Optional[float] = None
    performance_score: Optional[float] = None
    security_score: Optional[float] = None
    content_score: Optional[float] = None
    ux_score: Optional[float] = None
    total_issues: int = 0
    critical_issues: int = 0
    execution_time_seconds: Optional[float] = None


class AnalysisDetail(AnalysisSummary):
    """Full analysis record including the report JSON."""
    report_json: Optional[dict[str, Any]] = None
    site_map_json: Optional[dict[str, Any]] = None
    external_api_data: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------

class SiteResponse(BaseModel):
    """GET /v1/site/{domain} response."""
    site: SiteRecord
    analyses: list[AnalysisSummary] = Field(default_factory=list)
    total_analyses: int = 0
    page: int = 1
    limit: int = 10


class ReportResponse(BaseModel):
    """GET /v1/report/{id} response."""
    id: UUID
    domain: str
    created_at: datetime
    overall_score: Optional[float] = None
    accessibility_score: Optional[float] = None
    seo_score: Optional[float] = None
    performance_score: Optional[float] = None
    security_score: Optional[float] = None
    content_score: Optional[float] = None
    ux_score: Optional[float] = None
    total_issues: int = 0
    critical_issues: int = 0
    execution_time_seconds: Optional[float] = None
    report: Optional[dict[str, Any]] = None


class RecentSiteItem(BaseModel):
    """A single item in the GET /v1/recent response."""
    domain: str
    url: str
    latest_overall_score: Optional[float] = None
    last_analyzed: datetime
    analysis_count: int = 1
    category: Optional[str] = None


class StatsResponse(BaseModel):
    """GET /v1/stats response."""
    total_sites: int = 0
    total_analyses: int = 0
    total_issues: int = 0
    avg_score: Optional[float] = None
