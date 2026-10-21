-- Migration 010: Unlimited aliases and storage for users
UPDATE users SET alias_limit = 999999, storage_limit = 107374182400 WHERE alias_limit <= 5;
