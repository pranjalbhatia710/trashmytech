-- 006_create_seo_snapshots.sql
-- SEO snapshot: detailed technical SEO data captured per analysis.

CREATE TABLE IF NOT EXISTS seo_snapshots (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id             UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Technical SEO
    robots_txt_exists       BOOLEAN,
    robots_txt_content      TEXT,
    sitemap_exists          BOOLEAN,
    sitemap_url             TEXT,
    ssl_valid               BOOLEAN,
    ssl_issuer              TEXT,
    ssl_expiry              TIMESTAMPTZ,
    viewport_meta           BOOLEAN,
    title_tag               TEXT,
    title_length            INTEGER,
    meta_description        TEXT,
    meta_desc_length        INTEGER,
    h1_tag                  TEXT,
    h1_count                INTEGER,
    heading_hierarchy_valid BOOLEAN,
    heading_structure       JSONB,
    og_tags                 JSONB,
    twitter_card            JSONB,
    json_ld                 JSONB,
    structured_data_types   TEXT[],

    -- Performance
    fcp_ms                  FLOAT,
    dcl_ms                  FLOAT,
    full_load_ms            FLOAT,
    lighthouse_performance  FLOAT,
    lighthouse_accessibility FLOAT,
    lighthouse_best_practices FLOAT,
    lighthouse_seo          FLOAT,

    -- Security
    observatory_grade       TEXT,
    safe_browsing_status    TEXT,
    ssl_validity_days       INTEGER,
    domain_age_days         INTEGER,

    -- Content
    word_count              INTEGER,
    flesch_score            FLOAT,
    reading_level           TEXT,
    grammar_errors          INTEGER,

    -- Trust signals
    has_privacy_policy      BOOLEAN,
    has_terms               BOOLEAN,
    has_contact_page        BOOLEAN,
    has_about_page          BOOLEAN,

    -- Links
    internal_links_count    INTEGER,
    external_links_count    INTEGER,
    broken_links_count      INTEGER,

    -- Images
    image_alt_coverage      FLOAT,

    -- DNS auth
    spf_record              BOOLEAN,
    dmarc_record            BOOLEAN,

    -- Tech & carbon
    tech_stack              JSONB,
    carbon_footprint_grams  FLOAT,
    green_hosting           BOOLEAN
);
