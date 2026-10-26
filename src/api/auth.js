'use strict';
const express = require('express');
const router = express.Router();
const { consumeLoginToken } = require('../auth/loginToken');
const { createWebSession } = require('../auth/sessions');
const { getDb } = require('../../database/database');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { authenticateLocal, isLocalAuthAvailable, getLocalAuthHint } = require('../services/localAuthService');
const { validateLanguage } = require('../i18n');
const logger = require('../monitoring/logger');

function safeIp(req) {
  return req.ip || (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : null);
}

function issueSession(req, res, user, auditAction) {
  const ip = safeIp(req);
  const { rawToken, sessionId } = createWebSession(user.tg_id, {
    userAgent: req.headers['user-agent'],
    ipAddress: ip
  });
  getDb().prepare('INSERT INTO audit_logs(tg_id,action,ip_address,user_agent)VALUES(?,?,?,?)')
    .run(user.tg_id, auditAction, ip, req.headers['user-agent']);
  return res.json({
    token: rawToken,
    sessionId,
    user: {
      tgId: user.tg_id,
      username: user.username,
      role: user.role,
      language: user.language,
      timezone: user.timezone
    }
  });
}

// Exchanges a single-use Telegram login token (created by the bot's /login
// command) for a regular web session token.
router.post('/login', authLimiter, (req, res) => {
  const tgId = consumeLoginToken(req.body?.token);
  if (!tgId) return res.status(401).json({ error: 'Login link invalid or expired' });
  const user = getDb().prepare('SELECT tg_id, username, role, language, timezone, is_banned, totp_enabled FROM users WHERE tg_id=?').get(tgId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });
  return issueSession(req, res, user, 'auth.login_bot');
});

// Local administrator login for self-hosted installations that do not use the
// Telegram bot. The account is bootstrapped from LOCAL_ADMIN_* variables.
router.post('/local/login', authLimiter, async (req, res) => {
  try {
    if (!isLocalAuthAvailable()) {
      return res.status(404).json({ error: 'Local password login is not enabled on this server' });
    }
    const username = req.body?.username;
    const password = req.body?.password;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const result = await authenticateLocal(username, password);
    if (!result) {
      getDb().prepare('INSERT INTO audit_logs(tg_id,action,ip_address,user_agent)VALUES(?,?,?,?)')
        .run(null, 'auth.local_login_failed', safeIp(req), req.headers['user-agent']);
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (result.banned) {
      return res.status(403).json({ error: 'Account suspended' });
    }
    const user = getDb().prepare('SELECT tg_id, username, role, language, timezone FROM users WHERE tg_id=?').get(result.user.tg_id);
    return issueSession(req, res, user, 'auth.login_local');
  } catch (err) {
    logger.error({ err: err.message }, 'Local login failed');
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/config', (req, res) => {
  const { getBot } = require('../bot/bot');
  const config = require('../../config/config');
  const bot = getBot();
  const botUsername = bot?.botInfo?.username || config.telegram?.botUsername || process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot';
  const local = getLocalAuthHint();
  res.json({
    botUsername,
    appName: config.app.name,
    version: config.app.version,
    telegramEnabled: Boolean(config.telegram.token),
    localAuthEnabled: Boolean(local),
    localAuthUsername: local?.username || null
  });
});

router.patch('/profile', requireAuth, (req, res) => {
  const { language, timezone } = req.body || {};
  const db = getDb();
  if (language !== undefined) {
    if (!validateLanguage(language)) {
      return res.status(400).json({ error: 'Unsupported language code' });
    }
    db.prepare('UPDATE users SET language=? WHERE tg_id=?').run(language, req.tgId);
  }
  if (timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    db.prepare('UPDATE users SET timezone=? WHERE tg_id=?').run(timezone, req.tgId);
  }
  const updated = db.prepare('SELECT tg_id, username, role, language, timezone FROM users WHERE tg_id=?').get(req.tgId);
  res.json({ success: true, user: updated });
});

module.exports = router;
