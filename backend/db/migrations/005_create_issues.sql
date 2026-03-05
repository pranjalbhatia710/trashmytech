-- 005_create_issues.sql
-- Issues table: normalized issues from analysis findings.

CREATE TABLE IF NOT EXISTS issues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    persona_id      TEXT,
    type            TEXT NOT NULL CHECK (type IN ('a11y', 'ux', 'seo', 'content', 'performance', 'security')),
    severity        TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    title           TEXT NOT NULL,
    description     TEXT,
    page_url        TEXT,
    element         TEXT,
    screenshot      TEXT,
    issue_category  TEXT,
    seo_impact      TEXT,
    embedding       vector(768)
);
