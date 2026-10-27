-- Migration 020: Node FTP and SFTP Support
ALTER TABLE hosting_nodes ADD COLUMN ftp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hosting_nodes ADD COLUMN ftp_port INTEGER NOT NULL DEFAULT 21;
ALTER TABLE hosting_nodes ADD COLUMN ftp_status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE hosting_nodes ADD COLUMN ftp_server_type TEXT;
ALTER TABLE hosting_nodes ADD COLUMN ftp_banner TEXT;
ALTER TABLE hosting_nodes ADD COLUMN ftp_last_checked_at DATETIME;
ALTER TABLE hosting_nodes ADD COLUMN ftp_username TEXT;
ALTER TABLE hosting_nodes ADD COLUMN ftp_password TEXT;
ALTER TABLE hosting_nodes ADD COLUMN ftp_pasv_min INTEGER NOT NULL DEFAULT 30000;
ALTER TABLE hosting_nodes ADD COLUMN ftp_pasv_max INTEGER NOT NULL DEFAULT 30100;
ALTER TABLE hosting_nodes ADD COLUMN sftp_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS node_ftp_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL REFERENCES hosting_nodes(id) ON DELETE CASCADE,
    site_id INTEGER REFERENCES hosting_sites(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    root_path TEXT NOT NULL DEFAULT '/var/www/nodesites',
    permissions TEXT NOT NULL DEFAULT 'rw',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    last_login_at DATETIME,
    UNIQUE(node_id, username)
);

CREATE INDEX IF NOT EXISTS idx_node_ftp_users_node_id ON node_ftp_users(node_id);
CREATE INDEX IF NOT EXISTS idx_node_ftp_users_site_id ON node_ftp_users(site_id);
