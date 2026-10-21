CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,alias_address TEXT NOT NULL,subject TEXT,message_count INTEGER NOT NULL DEFAULT 1,last_message_at DATETIME NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(alias_address)REFERENCES aliases(address)ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_threads_alias ON threads(alias_address);
CREATE INDEX IF NOT EXISTS idx_threads_last ON threads(last_message_at DESC);
