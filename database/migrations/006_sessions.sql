CREATE TABLE IF NOT EXISTS web_sessions(id TEXT PRIMARY KEY,tg_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,user_agent TEXT,ip_address TEXT,country TEXT,device_name TEXT,created_at DATETIME NOT NULL DEFAULT(datetime('now')),last_active_at DATETIME NOT NULL DEFAULT(datetime('now')),expires_at DATETIME NOT NULL,FOREIGN KEY(tg_id)REFERENCES users(tg_id)ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_sessions_tg_id ON web_sessions(tg_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON web_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON web_sessions(expires_at);
