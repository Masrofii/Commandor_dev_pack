-- Migration 016: User Management, Ban Enforcement, Subscriptions & Redeem Codes

-- 1. Extend users table for ban tracking and subscription tiers
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN banned_at DATETIME;
ALTER TABLE users ADD COLUMN banned_by INTEGER;
ALTER TABLE users ADD COLUMN subscription_plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active'; -- 'active' | 'expired' | 'lifetime' | 'cancelled'
ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME;
ALTER TABLE users ADD COLUMN subscription_started_at DATETIME;
ALTER TABLE users ADD COLUMN custom_domain_limit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN application_limit INTEGER NOT NULL DEFAULT 3;
ALTER TABLE users ADD COLUMN node_limit INTEGER NOT NULL DEFAULT 1;

-- 2. Subscription Plans Master Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_usd REAL NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly' | 'lifetime'
    alias_limit INTEGER NOT NULL DEFAULT 5,
    storage_limit INTEGER NOT NULL DEFAULT 104857600, -- 100 MB
    custom_domain_limit INTEGER NOT NULL DEFAULT 1,
    application_limit INTEGER NOT NULL DEFAULT 3,
    node_limit INTEGER NOT NULL DEFAULT 1,
    features_json TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Seed Official Subscription Tiers
INSERT OR IGNORE INTO subscription_plans (id, name, description, price_usd, billing_cycle, alias_limit, storage_limit, custom_domain_limit, application_limit, node_limit, features_json)
VALUES 
('free', 'Free Tier', 'Standard starter access for individual developers', 0, 'monthly', 5, 104857600, 1, 3, 1, '["Basic burner emails","1 Custom Domain","3 Git Apps","1 Node","Community Support"]'),
('starter', 'Starter Pack', 'Enhanced quotas for growing projects', 9, 'monthly', 30, 1073741824, 3, 8, 3, '["30 Aliases","1 GB Storage","3 Custom Domains","8 Git Apps","3 VPS Nodes","Webhook Retries"]'),
('pro', 'Pro Developer', 'Full platform capabilities for production teams', 29, 'monthly', 250, 10737418240, 15, 25, 10, '["250 Aliases","10 GB Storage","15 Custom Domains","25 Git Apps","10 VPS Nodes","Subdomain Templates","Priority TLS Handshake","Unlimited Webhooks"]'),
('enterprise', 'Enterprise Unlimited', 'High-throughput cluster with unlimited scale', 99, 'monthly', 999999, 107374182400, 999999, 100, 50, '["Unlimited Aliases","100 GB Storage","Unlimited Domains","100 Git Apps","50 VPS Nodes","Custom Reverse Proxy Configs","Dedicated Support"]');

-- 3. Redeem Codes Table
CREATE TABLE IF NOT EXISTS redeem_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    title TEXT NOT NULL,
    reward_type TEXT NOT NULL DEFAULT 'subscription', -- 'subscription' | 'storage_boost' | 'alias_boost' | 'domain_boost'
    reward_plan TEXT DEFAULT 'pro', -- Targets 'starter' | 'pro' | 'enterprise'
    reward_duration_days INTEGER NOT NULL DEFAULT 30, -- Days granted if subscription
    reward_storage_bytes INTEGER NOT NULL DEFAULT 0,
    reward_alias_count INTEGER NOT NULL DEFAULT 0,
    reward_domain_count INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 1, -- 0 for unlimited uses
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at DATETIME, -- NULL for no expiration
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_active ON redeem_codes(is_active);

-- 4. Redeem Logs Table
CREATE TABLE IF NOT EXISTS redeem_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER NOT NULL,
    code TEXT NOT NULL COLLATE NOCASE,
    tg_id INTEGER NOT NULL,
    reward_summary TEXT NOT NULL,
    ip_address TEXT,
    redeemed_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (code_id) REFERENCES redeem_codes(id) ON DELETE CASCADE,
    FOREIGN KEY (tg_id) REFERENCES users(tg_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redeem_logs_tg_id ON redeem_logs(tg_id);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_code ON redeem_logs(code);

-- Seed Sample Promo Voucher for testing
INSERT OR IGNORE INTO redeem_codes (code, title, reward_type, reward_plan, reward_duration_days, max_uses, is_active, created_at)
VALUES 
('COMMANDOR-PRO-2026', 'Commandor Pro 30-Day Developer Pass', 'subscription', 'pro', 30, 100, 1, datetime('now')),
('STARTER-GIFT', 'Starter Pack 60-Day Access', 'subscription', 'starter', 60, 50, 1, datetime('now'));
