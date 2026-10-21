-- Migration 012: Multi-Node VPS Hosting Service for Simple Sites
CREATE TABLE IF NOT EXISTS hosting_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL DEFAULT 'root',
    password TEXT,
    private_key TEXT,
    http_port INTEGER NOT NULL DEFAULT 8080,
    public_url TEXT,
    status TEXT NOT NULL DEFAULT 'online', -- 'online' | 'offline' | 'error' | 'provisioning'
    last_ping_at DATETIME,
    system_info TEXT, -- JSON: os, cpu, ram, disk
    max_sites INTEGER NOT NULL DEFAULT 50,
    current_sites INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hosting_nodes_status ON hosting_nodes(status);
CREATE INDEX IF NOT EXISTS idx_hosting_nodes_active ON hosting_nodes(is_active);

CREATE TABLE IF NOT EXISTS hosting_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_sites INTEGER NOT NULL DEFAULT 1,
    max_storage_bytes INTEGER NOT NULL DEFAULT 52428800, -- 50 MB
    max_files INTEGER NOT NULL DEFAULT 100,
    max_requests_monthly INTEGER NOT NULL DEFAULT 50000,
    allow_nodejs INTEGER NOT NULL DEFAULT 0,
    allow_python INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO hosting_plans (id, name, max_sites, max_storage_bytes, max_files, max_requests_monthly, allow_nodejs, allow_python, is_default)
VALUES 
('free', 'Free Tier', 1, 52428800, 100, 50000, 0, 0, 1),
('starter', 'Starter Pack', 3, 209715200, 500, 150000, 0, 0, 0),
('pro', 'Pro Developer', 10, 1073741824, 2000, 500000, 1, 1, 0),
('unlimited', 'Admin Unlimited', 999999, 53687091200, 999999, 99999999, 1, 1, 0);

CREATE TABLE IF NOT EXISTS hosting_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    subdomain TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
    site_type TEXT NOT NULL DEFAULT 'static', -- 'static' | 'nodejs' | 'python'
    plan_id TEXT NOT NULL DEFAULT 'free',
    remote_path TEXT,
    internal_port INTEGER,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'deploying' | 'error'
    storage_used_bytes INTEGER NOT NULL DEFAULT 0,
    files_count INTEGER NOT NULL DEFAULT 0,
    visits_count INTEGER NOT NULL DEFAULT 0,
    tos_accepted INTEGER NOT NULL DEFAULT 1,
    tos_accepted_at DATETIME NOT NULL DEFAULT (datetime('now')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    last_deployed_at DATETIME,
    FOREIGN KEY(tg_id) REFERENCES users(tg_id) ON DELETE CASCADE,
    FOREIGN KEY(node_id) REFERENCES hosting_nodes(id) ON DELETE RESTRICT,
    FOREIGN KEY(plan_id) REFERENCES hosting_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_hosting_sites_tg_id ON hosting_sites(tg_id);
CREATE INDEX IF NOT EXISTS idx_hosting_sites_node_id ON hosting_sites(node_id);
CREATE INDEX IF NOT EXISTS idx_hosting_sites_full_domain ON hosting_sites(full_domain);

CREATE TABLE IF NOT EXISTS hosting_security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    site_id INTEGER,
    threat_type TEXT NOT NULL, -- 'crypto_miner' | 'phishing_kit' | 'webshell' | 'blocked_extension'
    file_name TEXT NOT NULL,
    matched_pattern TEXT,
    action_taken TEXT NOT NULL DEFAULT 'blocked',
    ip_address TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hosting_sec_tg_id ON hosting_security_logs(tg_id);
