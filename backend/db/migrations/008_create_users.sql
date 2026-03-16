-- 008_create_users.sql
-- Users table: authentication and billing state.

CREATE TABLE IF NOT EXISTS users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 TEXT UNIQUE NOT NULL,
    name                  TEXT,
    password_hash         TEXT,
    provider              TEXT NOT NULL DEFAULT 'credentials',
    provider_account_id   TEXT,
    google_id             TEXT UNIQUE,
    image                 TEXT,
    has_paid              BOOLEAN NOT NULL DEFAULT false,
    free_analysis_used    BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id    TEXT,
    stripe_session_id     TEXT,
    paid_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);
