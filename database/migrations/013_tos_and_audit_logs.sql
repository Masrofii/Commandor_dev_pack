-- Migration 013: Terms of Service Tracking and Audit Logging Enhancements
ALTER TABLE users ADD COLUMN tos_accepted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN tos_accepted_at DATETIME;

ALTER TABLE audit_logs ADD COLUMN category TEXT DEFAULT 'system';
ALTER TABLE audit_logs ADD COLUMN metadata TEXT DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);

CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    released_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
