-- 004_create_persona_sessions.sql
-- Persona sessions: one row per persona per analysis run.

CREATE TABLE IF NOT EXISTS persona_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id         UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    persona_id          TEXT NOT NULL,
    persona_name        TEXT NOT NULL,
    persona_category    TEXT,
    task_completed      BOOLEAN NOT NULL DEFAULT false,
    failure_reason      TEXT,
    time_spent_seconds  FLOAT,
    pages_visited       INTEGER DEFAULT 0,
    actions_taken       INTEGER DEFAULT 0,
    session_log         JSONB,
    screenshots         TEXT[]
);
