'use strict';
const { getDb } = require('../../database/database');
const { logChange } = require('./auditLogger');
const { getWebSocketServer } = require('../realtime/websocket');
const logger = require('../monitoring/logger');

function listUsers({ page = 1, limit = 50, search = null, role = null, status = null, plan = null } = {}) {
  const db = getDb();
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
  const params = [];
  let where = 'WHERE 1=1';

  if (search) {
    where += ' AND (u.username LIKE ? OR u.first_name LIKE ? OR CAST(u.tg_id AS TEXT) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (role) {
    where += ' AND u.role = ?';
    params.push(role);
  }

  if (status === 'banned') {
    where += ' AND u.is_banned = 1';
  } else if (status === 'active') {
    where += ' AND u.is_banned = 0';
  }

  if (plan) {
    where += ' AND u.subscription_plan = ?';
    params.push(plan);
  }

  const countQuery = `SELECT COUNT(*) as c FROM users u ${where}`;
  const total = db.prepare(countQuery).get(...params)?.c || 0;

  const dataQuery = `
    SELECT 
      u.tg_id, u.username, u.first_name, u.last_name, u.role, u.is_banned,
      u.ban_reason, u.banned_at, u.banned_by,
      u.subscription_plan, u.subscription_status, u.subscription_expires_at, u.subscription_started_at,
      u.storage_used, u.storage_limit, u.alias_limit, u.custom_domain_limit, u.application_limit, u.node_limit,
      u.created_at, u.last_seen_at,
      (SELECT COUNT(*) FROM aliases WHERE tg_id = u.tg_id) AS aliases_count,
      (SELECT COUNT(*) FROM custom_domains WHERE tg_id = u.tg_id) AS domains_count,
      (SELECT COUNT(*) FROM subdomains WHERE tg_id = u.tg_id AND application_id IS NOT NULL) AS applications_count
    FROM users u
    ${where}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(dataQuery).all(...params, parseInt(limit, 10), offset);

  return {
    users: rows,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(total / parseInt(limit, 10))
  };
}

function getUserDetails(tgId) {
  const db = getDb();
  const user = db.prepare(`
    SELECT 
      u.*,
      p.name AS plan_name, p.features_json AS plan_features, p.price_usd AS plan_price
    FROM users u
    LEFT JOIN subscription_plans p ON u.subscription_plan = p.id
    WHERE u.tg_id = ?
  `).get(tgId);

  if (!user) return null;

  // Calculate days remaining
  let daysRemaining = null;
  let isExpired = false;
  if (user.subscription_expires_at) {
    const diffMs = new Date(user.subscription_expires_at).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    if (diffMs <= 0 && user.subscription_status === 'active') {
      isExpired = true;
    }
  }

  // Count active resources
  const aliasesCount = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id = ?').get(tgId)?.c || 0;
  const domainsCount = db.prepare('SELECT COUNT(*) as c FROM custom_domains WHERE tg_id = ?').get(tgId)?.c || 0;
  const appsCount = db.prepare('SELECT COUNT(*) as c FROM subdomains WHERE tg_id = ? AND application_id IS NOT NULL').get(tgId)?.c || 0;
  const webhooksCount = db.prepare('SELECT COUNT(*) as c FROM webhooks WHERE tg_id = ?').get(tgId)?.c || 0;

  return {
    ...user,
    plan_features: user.plan_features ? JSON.parse(user.plan_features) : [],
    daysRemaining,
    isExpired,
    usage: {
      aliases: aliasesCount,
      domains: domainsCount,
      applications: appsCount,
      webhooks: webhooksCount,
      storageBytes: user.storage_used
    }
  };
}

/**
 * Ban user, destroy active web sessions, and disconnect real-time connections
 */
function banUser(targetTgId, { reason = 'Terms of service violation', adminTgId = null, ipAddress = null } = {}) {
  const db = getDb();
  const user = db.prepare('SELECT tg_id, username, role FROM users WHERE tg_id = ?').get(targetTgId);
  if (!user) throw new Error(`User #${targetTgId} not found`);

  if (user.role === 'admin') {
    throw new Error('Platform administrators cannot be banned.');
  }

  const cleanReason = String(reason || 'Administrative suspension').trim();

  db.prepare(`
    UPDATE users 
    SET is_banned = 1,
        ban_reason = ?,
        banned_at = datetime('now'),
        banned_by = ?
    WHERE tg_id = ?
  `).run(cleanReason, adminTgId, targetTgId);

  // Terminate all web sessions
  const deletedSessions = db.prepare('DELETE FROM web_sessions WHERE tg_id = ?').run(targetTgId).changes;

  // Disconnect active WebSockets if any
  try {
    const wsServer = getWebSocketServer?.();
    if (wsServer && wsServer.clients && wsServer.clients.has(targetTgId)) {
      const clientSockets = wsServer.clients.get(targetTgId);
      for (const ws of clientSockets) {
        try { ws.close(4003, 'Account suspended'); } catch {}
      }
      wsServer.clients.delete(targetTgId);
    }
  } catch (err) {
    logger.warn({ err: err.message, targetTgId }, 'Failed to close websockets for banned user');
  }

  logChange({
    tgId: adminTgId,
    category: 'user_management',
    action: 'user_banned',
    details: `User @${user.username || targetTgId} banned: ${cleanReason}`,
    metadata: { targetTgId, reason: cleanReason, terminatedSessions: deletedSessions, ipAddress }
  }).catch(() => {});

  return {
    success: true,
    tgId: targetTgId,
    is_banned: 1,
    ban_reason: cleanReason,
    terminatedSessions: deletedSessions
  };
}

/**
 * Unban user and reinstate access
 */
function unbanUser(targetTgId, { adminTgId = null, ipAddress = null } = {}) {
  const db = getDb();
  const user = db.prepare('SELECT tg_id, username FROM users WHERE tg_id = ?').get(targetTgId);
  if (!user) throw new Error(`User #${targetTgId} not found`);

  db.prepare(`
    UPDATE users 
    SET is_banned = 0,
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL
    WHERE tg_id = ?
  `).run(targetTgId);

  logChange({
    tgId: adminTgId,
    category: 'user_management',
    action: 'user_unbanned',
    details: `User @${user.username || targetTgId} reinstated from suspension`,
    metadata: { targetTgId, ipAddress }
  }).catch(() => {});

  return {
    success: true,
    tgId: targetTgId,
    is_banned: 0
  };
}

/**
 * Set user subscription tier, expiration, and apply plan quota limits
 */
function setSubscription(targetTgId, { planId = 'free', durationDays = 30, isLifetime = false, adminTgId = null, ipAddress = null } = {}) {
  const db = getDb();
  const user = db.prepare('SELECT tg_id, username, subscription_plan, subscription_expires_at FROM users WHERE tg_id = ?').get(targetTgId);
  if (!user) throw new Error(`User #${targetTgId} not found`);

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) throw new Error(`Subscription plan "${planId}" not found`);

  let newExpiresAt = null;
  let status = 'active';

  if (isLifetime || planId === 'enterprise' && isLifetime) {
    status = 'lifetime';
    newExpiresAt = null;
  } else if (planId === 'free') {
    status = 'active';
    newExpiresAt = null;
  } else {
    const days = parseInt(durationDays, 10) || 30;
    // If user currently has active unexpired subscription of same plan, extend from existing expiration
    let baseDate = new Date();
    if (user.subscription_plan === planId && user.subscription_expires_at) {
      const currentExp = new Date(user.subscription_expires_at);
      if (currentExp > baseDate) {
        baseDate = currentExp;
      }
    }
    baseDate.setDate(baseDate.getDate() + days);
    newExpiresAt = baseDate.toISOString().replace('T', ' ').substring(0, 19);
  }

  db.prepare(`
    UPDATE users 
    SET subscription_plan = ?,
        subscription_status = ?,
        subscription_expires_at = ?,
        subscription_started_at = datetime('now'),
        alias_limit = ?,
        storage_limit = ?,
        custom_domain_limit = ?,
        application_limit = ?,
        node_limit = ?
    WHERE tg_id = ?
  `).run(
    plan.id,
    status,
    newExpiresAt,
    plan.alias_limit,
    plan.storage_limit,
    plan.custom_domain_limit,
    plan.application_limit,
    plan.node_limit,
    targetTgId
  );

  logChange({
    tgId: adminTgId,
    category: 'subscription',
    action: 'subscription_updated',
    details: `Updated subscription for @${user.username || targetTgId} to "${plan.name}" (Expires: ${newExpiresAt || 'Lifetime/Free'})`,
    metadata: { targetTgId, planId: plan.id, status, expiresAt: newExpiresAt, ipAddress }
  }).catch(() => {});

  return getUserDetails(targetTgId);
}

function listSubscriptionPlans() {
  const db = getDb();
  const plans = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_usd ASC').all();
  return plans.map(p => ({
    ...p,
    features: p.features_json ? JSON.parse(p.features_json) : []
  }));
}

module.exports = {
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  setSubscription,
  listSubscriptionPlans
};
