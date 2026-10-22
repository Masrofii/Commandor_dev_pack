-- Migration 017: Accurate separate storage quotas for email and website/app hosting
-- Enforces distinct per-user quotas (defaults: 1 GB email, 5 GB hosting)

-- 1. Add dedicated storage tracking columns to users
ALTER TABLE users ADD COLUMN email_storage_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_storage_limit INTEGER NOT NULL DEFAULT 1073741824; -- 1 GB default
ALTER TABLE users ADD COLUMN hosting_storage_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN hosting_storage_limit INTEGER NOT NULL DEFAULT 5368709120; -- 5 GB default

-- 2. Add dedicated storage limits to subscription_plans
ALTER TABLE subscription_plans ADD COLUMN email_storage_limit INTEGER NOT NULL DEFAULT 1073741824;
ALTER TABLE subscription_plans ADD COLUMN hosting_storage_limit INTEGER NOT NULL DEFAULT 5368709120;

-- 3. Update subscription plans with tiered storage limits
UPDATE subscription_plans SET 
    email_storage_limit = 1073741824,   -- 1 GB
    hosting_storage_limit = 5368709120   -- 5 GB
WHERE id = 'free';

UPDATE subscription_plans SET 
    email_storage_limit = 5368709120,   -- 5 GB
    hosting_storage_limit = 16106127360  -- 15 GB
WHERE id = 'starter';

UPDATE subscription_plans SET 
    email_storage_limit = 26843545600,  -- 25 GB
    hosting_storage_limit = 53687091200 -- 50 GB
WHERE id = 'pro';

UPDATE subscription_plans SET 
    email_storage_limit = 107374182400,  -- 100 GB
    hosting_storage_limit = 536870912000 -- 500 GB
WHERE id = 'enterprise';

-- 4. Backfill existing users' email_storage_used from actual emails and attachments
UPDATE users SET email_storage_used = (
    COALESCE((
        SELECT SUM(e.size_bytes) 
        FROM emails e 
        JOIN aliases a ON e.alias_address = a.address COLLATE NOCASE
        WHERE a.tg_id = users.tg_id AND e.is_deleted = 0
    ), 0) + 
    COALESCE((
        SELECT SUM(att.size) 
        FROM attachments att 
        JOIN emails e ON att.email_id = e.id 
        JOIN aliases a ON e.alias_address = a.address COLLATE NOCASE
        WHERE a.tg_id = users.tg_id AND e.is_deleted = 0
    ), 0)
);

-- If email_storage_used is 0 but legacy storage_used > 0 and user has no hosting sites, transfer legacy storage_used
UPDATE users SET email_storage_used = storage_used 
WHERE email_storage_used = 0 AND storage_used > 0 
  AND NOT EXISTS (SELECT 1 FROM hosting_sites WHERE tg_id = users.tg_id);

-- 5. Backfill existing users' hosting_storage_used from hosting_sites
UPDATE users SET hosting_storage_used = COALESCE((
    SELECT SUM(storage_used_bytes) 
    FROM hosting_sites 
    WHERE tg_id = users.tg_id
), 0);

-- 6. Synchronize legacy storage_used and storage_limit for full backward compatibility
UPDATE users SET storage_used = email_storage_used + hosting_storage_used;
UPDATE users SET storage_limit = email_storage_limit + hosting_storage_limit;
