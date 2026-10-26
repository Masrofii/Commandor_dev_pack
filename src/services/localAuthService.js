'use strict';
const { getDb } = require('../../database/database');
const config = require('../../config/config');
const { hashPassword, verifyPassword } = require('../utils/crypto');
const logger = require('../monitoring/logger');

const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7e4VYtWf0Y1pJvXq0m6g0XyR5m8Yf5u';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername(username) {
  const clean = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(clean)) {
    throw new Error('Local username must be 3-64 characters using letters, numbers, dots, underscores, or hyphens.');
  }
  return clean;
}

/**
 * Create or update the local administrator account from environment variables.
 * The password hash is only rewritten when the configured password actually
 * changes, so existing sessions are not invalidated on every restart.
 */
async function ensureLocalAdmin() {
  if (!config.localAuth.enabled || !config.localAuth.password) {
    return null;
  }

  const db = getDb();
  const username = validateUsername(config.localAuth.username);
  const tgId = config.localAuth.tgId;
  const existing = db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgId);
  const passwordChanged = !existing?.password_hash || !(await verifyPassword(config.localAuth.password, existing.password_hash));

  if (existing) {
    if (existing.local_username && existing.local_username !== username) {
      const conflict = db.prepare('SELECT tg_id FROM users WHERE local_username=? AND tg_id!=?').get(username, tgId);
      if (conflict) throw new Error(`Local username "${username}" is already assigned to another account`);
    }
    if (passwordChanged) {
      const hash = await hashPassword(config.localAuth.password);
      db.prepare(`
        UPDATE users
        SET local_username=?, password_hash=?, role='admin', is_banned=0, username=COALESCE(username, ?)
        WHERE tg_id=?
      `).run(username, hash, username, tgId);
      // A password rotation invalidates previously issued sessions for this account.
      db.prepare('DELETE FROM web_sessions WHERE tg_id=?').run(tgId);
      logger.info({ tgId, username }, 'Local administrator password synchronized');
    } else if (existing.local_username !== username || existing.role !== 'admin') {
      db.prepare("UPDATE users SET local_username=?, role='admin', is_banned=0 WHERE tg_id=?").run(username, tgId);
    }
    return db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgId);
  }

  const hash = await hashPassword(config.localAuth.password);
  db.prepare(`
    INSERT INTO users (tg_id, username, first_name, local_username, password_hash, role, language, created_at)
    VALUES (?, ?, ?, ?, ?, 'admin', 'en', datetime('now'))
  `).run(tgId, username, 'Local Administrator', username, hash);

  logger.info({ tgId, username }, 'Local administrator account created');
  db.prepare('INSERT INTO audit_logs(tg_id, action, ip_address, user_agent) VALUES(?,?,?,?)')
    .run(tgId, 'auth.local_admin_bootstrapped', null, 'system');
  return db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgId);
}

function hasLocalAccount() {
  try {
    return Boolean(getDb().prepare("SELECT 1 FROM users WHERE local_username IS NOT NULL AND password_hash IS NOT NULL LIMIT 1").get());
  } catch {
    return false;
  }
}

function isLocalAuthAvailable() {
  if (!config.localAuth.enabled) return false;
  if (config.localAuth.password) return true;
  return hasLocalAccount();
}

function getLocalAuthHint() {
  if (!isLocalAuthAvailable()) return null;
  if (config.localAuth.password) return { username: normalizeUsername(config.localAuth.username) };
  try {
    const user = getDb().prepare('SELECT local_username FROM users WHERE local_username IS NOT NULL AND password_hash IS NOT NULL LIMIT 1').get();
    return user ? { username: user.local_username } : null;
  } catch {
    return null;
  }
}

/**
 * Verify local administrator credentials. Always performs a bcrypt comparison,
 * even for unknown usernames, to avoid user enumeration through timing.
 */
async function authenticateLocal(username, password) {
  if (!isLocalAuthAvailable()) {
    throw new Error('Local password login is not enabled on this server');
  }
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || typeof password !== 'string' || !password) {
    return null;
  }

  const db = getDb();
  const user = db.prepare(`
    SELECT tg_id, username, role, is_banned, password_hash
    FROM users WHERE local_username=?
  `).get(cleanUsername);

  if (!user?.password_hash) {
    await verifyPassword(password, DUMMY_HASH).catch(() => false);
    return null;
  }
  if (user.is_banned) return { banned: true, user };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;
  return { user };
}

module.exports = {
  ensureLocalAdmin,
  authenticateLocal,
  isLocalAuthAvailable,
  getLocalAuthHint,
  validateUsername
};
