-- 009_add_analysis_mode.sql
-- Add analysis_mode and user_id columns to the analyses table.

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS analysis_mode TEXT DEFAULT 'standard';
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id) WHERE user_id IS NOT NULL;
