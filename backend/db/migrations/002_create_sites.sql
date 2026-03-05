-- 002_create_sites.sql
-- Sites table: one row per unique domain ever analyzed.

CREATE TABLE IF NOT EXISTS sites (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url                         TEXT NOT NULL,
    domain                      TEXT UNIQUE NOT NULL,
    category                    TEXT,
    first_analyzed              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_analyzed               TIMESTAMPTZ NOT NULL DEFAULT now(),
    analysis_count              INTEGER NOT NULL DEFAULT 1,
    latest_overall_score        FLOAT,
    latest_accessibility_score  FLOAT,
    latest_seo_score            FLOAT,
    latest_performance_score    FLOAT,
    latest_security_score       FLOAT,
    latest_content_score        FLOAT,
    latest_ux_score             FLOAT,
    embedding                   vector(768)
);
