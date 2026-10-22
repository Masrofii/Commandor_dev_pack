-- Migration 014: Commandor Dev Pack Core Platform Expansion
-- Adds robust schema for node management, domain inventory, DNS providers,
-- subdomain routing wizard, applications, proxy routes, and verified backups.

-- 1. Extend hosting_nodes with credentials metadata, labels, host key verification, and troubleshooting
ALTER TABLE hosting_nodes ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password';
ALTER TABLE hosting_nodes ADD COLUMN host_key_fingerprint TEXT;
ALTER TABLE hosting_nodes ADD COLUMN labels TEXT;
ALTER TABLE hosting_nodes ADD COLUMN groups TEXT;
ALTER TABLE hosting_nodes ADD COLUMN notes TEXT;
ALTER TABLE hosting_nodes ADD COLUMN last_error TEXT;
ALTER TABLE hosting_nodes ADD COLUMN last_error_at DATETIME;
ALTER TABLE hosting_nodes ADD COLUMN uptime_seconds INTEGER NOT NULL DEFAULT 0;

-- 2. Extend custom_domains for complete domain inventory & DNS provider integration
ALTER TABLE custom_domains ADD COLUMN registrar TEXT;
ALTER TABLE custom_domains ADD COLUMN dns_provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE custom_domains ADD COLUMN dns_provider_token TEXT;
ALTER TABLE custom_domains ADD COLUMN dns_zone_id TEXT;
ALTER TABLE custom_domains ADD COLUMN expiry_date TEXT;
ALTER TABLE custom_domains ADD COLUMN notes TEXT;
ALTER TABLE custom_domains ADD COLUMN dns_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE custom_domains ADD COLUMN cert_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE custom_domains ADD COLUMN routing_status TEXT NOT NULL DEFAULT 'active';

-- 3. Extend subdomains for guided wizard destinations, DNS tracking, proxy and TLS verification
ALTER TABLE subdomains ADD COLUMN domain_id INTEGER REFERENCES custom_domains(id) ON DELETE SET NULL;
ALTER TABLE subdomains ADD COLUMN node_id INTEGER REFERENCES hosting_nodes(id) ON DELETE SET NULL;
ALTER TABLE subdomains ADD COLUMN application_id INTEGER;
ALTER TABLE subdomains ADD COLUMN destination_type TEXT NOT NULL DEFAULT 'internal_service';
ALTER TABLE subdomains ADD COLUMN destination_target TEXT;
ALTER TABLE subdomains ADD COLUMN dns_record_type TEXT NOT NULL DEFAULT 'A';
ALTER TABLE subdomains ADD COLUMN dns_record_value TEXT;
ALTER TABLE subdomains ADD COLUMN dns_record_id TEXT;
ALTER TABLE subdomains ADD COLUMN dns_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE subdomains ADD COLUMN proxy_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE subdomains ADD COLUMN proxy_config_path TEXT;
ALTER TABLE subdomains ADD COLUMN https_status TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE subdomains ADD COLUMN cert_expiry_at DATETIME;
ALTER TABLE subdomains ADD COLUMN last_verified_at DATETIME;
ALTER TABLE subdomains ADD COLUMN last_verification_results TEXT;

-- 4. Applications table for developer platform deployments
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT,
    node_id INTEGER,
    subdomain_id INTEGER,
    git_repo TEXT,
    git_branch TEXT NOT NULL DEFAULT 'main',
    build_command TEXT,
    start_command TEXT,
    env_vars TEXT, -- Encrypted JSON
    port INTEGER,
    status TEXT NOT NULL DEFAULT 'stopped', -- 'stopped' | 'running' | 'deploying' | 'failed'
    health_check_path TEXT NOT NULL DEFAULT '/',
    last_deployed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (node_id) REFERENCES hosting_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_name ON applications(name);
CREATE INDEX IF NOT EXISTS idx_applications_node ON applications(node_id);

-- 5. Application deployments history & audit logs
CREATE TABLE IF NOT EXISTS application_deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    commit_hash TEXT,
    status TEXT NOT NULL, -- 'success' | 'failed' | 'in_progress'
    logs TEXT,
    error_message TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_deployments_app ON application_deployments(application_id);

-- 6. Managed Reverse Proxy Routes (for Nginx route generation & rollback)
CREATE TABLE IF NOT EXISTS proxy_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain_id INTEGER UNIQUE,
    server_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    upstream_target TEXT NOT NULL,
    proxy_type TEXT NOT NULL DEFAULT 'http', -- 'http' | 'websocket' | 'static' | 'redirect'
    ssl_enabled INTEGER NOT NULL DEFAULT 0,
    ssl_cert_path TEXT,
    ssl_key_path TEXT,
    config_content TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_reloaded_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proxy_routes_server ON proxy_routes(server_name);

-- 7. Verified Backups table
CREATE TABLE IF NOT EXISTS system_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_name TEXT NOT NULL,
    backup_type TEXT NOT NULL, -- 'database' | 'full' | 'config'
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed' | 'verified'
    checksum TEXT,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backups_created ON system_backups(created_at);

-- 8. DNS records cache (for tracking provider zones and sync state)
CREATE TABLE IF NOT EXISTS dns_records_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    record_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    ttl INTEGER NOT NULL DEFAULT 300,
    proxied INTEGER NOT NULL DEFAULT 0,
    last_synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (domain_id) REFERENCES custom_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dns_cache_domain ON dns_records_cache(domain_id);
