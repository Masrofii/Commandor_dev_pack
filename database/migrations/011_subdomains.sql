-- Migration 011: Subdomain Service for Email & Web Routing
CREATE TABLE IF NOT EXISTS subdomains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    subdomain TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
    base_domain TEXT NOT NULL COLLATE NOCASE,
    active INTEGER NOT NULL DEFAULT 1,
    
    -- Email Routing Settings
    email_catch_all INTEGER NOT NULL DEFAULT 1,
    email_webhook_url TEXT,
    
    -- Web/HTTP Routing Settings
    web_enabled INTEGER NOT NULL DEFAULT 1,
    web_mode TEXT NOT NULL DEFAULT 'landing', -- 'proxy' | 'redirect' | 'static' | 'webhook' | 'landing'
    web_target TEXT,
    web_custom_body TEXT,
    web_custom_status INTEGER NOT NULL DEFAULT 200,
    web_custom_content_type TEXT NOT NULL DEFAULT 'text/html; charset=utf-8',
    web_notify_telegram INTEGER NOT NULL DEFAULT 1,
    
    -- Statistics & Audit
    emails_received INTEGER NOT NULL DEFAULT 0,
    web_requests_count INTEGER NOT NULL DEFAULT 0,
    last_active_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tg_id) REFERENCES users(tg_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subdomains_tg_id ON subdomains(tg_id);
CREATE INDEX IF NOT EXISTS idx_subdomains_subdomain ON subdomains(subdomain);
CREATE INDEX IF NOT EXISTS idx_subdomains_full_domain ON subdomains(full_domain);

-- Captured Web Requests for Webhook / Collector mode
CREATE TABLE IF NOT EXISTS subdomain_web_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query_params TEXT,
    headers TEXT,
    body TEXT,
    ip TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subdomain_requests_subdomain_id ON subdomain_web_requests(subdomain_id);
