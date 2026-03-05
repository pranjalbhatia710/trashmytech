-- 007_create_indexes.sql
-- All indexes for the schema.

-- sites indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_domain ON sites (domain);
CREATE INDEX IF NOT EXISTS idx_sites_category ON sites (category);
CREATE INDEX IF NOT EXISTS idx_sites_last_analyzed ON sites (last_analyzed);
CREATE INDEX IF NOT EXISTS idx_sites_latest_overall_score ON sites (latest_overall_score);

-- sites vector index (HNSW for fast approximate nearest-neighbor search)
CREATE INDEX IF NOT EXISTS idx_sites_embedding ON sites
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- analyses indexes
CREATE INDEX IF NOT EXISTS idx_analyses_site_id ON analyses (site_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses (created_at);

-- persona_sessions indexes
CREATE INDEX IF NOT EXISTS idx_persona_sessions_analysis_id ON persona_sessions (analysis_id);
CREATE INDEX IF NOT EXISTS idx_persona_sessions_site_id ON persona_sessions (site_id);
CREATE INDEX IF NOT EXISTS idx_persona_sessions_persona_id ON persona_sessions (persona_id);

-- issues indexes
CREATE INDEX IF NOT EXISTS idx_issues_analysis_id ON issues (analysis_id);
CREATE INDEX IF NOT EXISTS idx_issues_site_id ON issues (site_id);
CREATE INDEX IF NOT EXISTS idx_issues_type ON issues (type);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues (severity);

-- issues vector index
CREATE INDEX IF NOT EXISTS idx_issues_embedding ON issues
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- seo_snapshots indexes
CREATE INDEX IF NOT EXISTS idx_seo_snapshots_analysis_id ON seo_snapshots (analysis_id);
CREATE INDEX IF NOT EXISTS idx_seo_snapshots_site_id ON seo_snapshots (site_id);
