CREATE TABLE IF NOT EXISTS custom_domains(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id INTEGER NOT NULL,domain TEXT NOT NULL UNIQUE,verification_token TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,verified_at DATETIME,dns_checked_at DATETIME,mx_configured INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at DATETIME NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(tg_id)REFERENCES users(tg_id)ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_custom_domains_tg_id ON custom_domains(tg_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
