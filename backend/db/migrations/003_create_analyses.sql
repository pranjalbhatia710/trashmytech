-- 003_create_analyses.sql
-- Analyses table: one row per analysis run.

CREATE TABLE IF NOT EXISTS analyses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    overall_score           FLOAT,
    accessibility_score     FLOAT,
    seo_score               FLOAT,
    performance_score       FLOAT,
    security_score          FLOAT,
    content_score           FLOAT,
    ux_score                FLOAT,
    total_issues            INTEGER DEFAULT 0,
    critical_issues         INTEGER DEFAULT 0,
    execution_time_seconds  FLOAT,
    report_json             JSONB,
    site_map_json           JSONB,
    external_api_data       JSONB
);
