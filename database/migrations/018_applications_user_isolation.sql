-- 018_applications_user_isolation.sql
-- Multi-tenant isolation: assign user_tg_id to applications and index for high performance

ALTER TABLE applications ADD COLUMN user_tg_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_tg_id);
