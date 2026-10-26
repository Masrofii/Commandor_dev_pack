-- Migration 019: local administrator authentication and real application runtime tracking

-- Local (non-Telegram) login support for self-hosted installations.
ALTER TABLE users ADD COLUMN local_username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_local_username
  ON users(local_username)
  WHERE local_username IS NOT NULL;

-- Track the on-disk workspace and supervised process for local app deployments.
ALTER TABLE applications ADD COLUMN workspace_path TEXT;
ALTER TABLE applications ADD COLUMN runtime_pid INTEGER;
ALTER TABLE applications ADD COLUMN runner TEXT NOT NULL DEFAULT 'local';
ALTER TABLE applications ADD COLUMN last_error TEXT;
