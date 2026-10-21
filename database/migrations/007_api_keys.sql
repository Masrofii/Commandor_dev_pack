CREATE TABLE IF NOT EXISTS api_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id INTEGER NOT NULL,name TEXT NOT NULL,key_prefix TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,scopes TEXT NOT NULL DEFAULT '[]',last_used_at DATETIME,created_at DATETIME NOT NULL DEFAULT(datetime('now')),expires_at DATETIME,revoked INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(tg_id)REFERENCES users(tg_id)ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id INTEGER,action TEXT NOT NULL,resource TEXT,resource_id TEXT,details TEXT,ip_address TEXT,user_agent TEXT,created_at DATETIME NOT NULL DEFAULT(datetime('now')));
CREATE INDEX IF NOT EXISTS idx_api_keys_tg_id ON api_keys(tg_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tg_id ON audit_logs(tg_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
