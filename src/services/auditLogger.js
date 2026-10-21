'use strict';

const { getDb } = require('../../database/database');
const logger = require('../monitoring/logger');
const config = require('../../config/config');
const { escapeHtml } = require('../utils/helpers');

let botInstance = null;

function setAuditBotInstance(bot) {
  botInstance = bot;
}

/**
 * Log a change / action to the database audit_logs table and notify admin
 */
async function logChange({
  tgId = null,
  category = 'system',
  action,
  details = '',
  metadata = {},
  ip = null,
  userAgent = null,
  notifyAdmin = true
}) {
  try {
    const db = getDb();
    const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
    
    db.prepare(`
      INSERT INTO audit_logs (tg_id, action, category, details, metadata, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(tgId, action, category, String(details), metaStr, ip, userAgent);

    logger.info({ tgId, category, action, details }, 'System change logged');

    // Notify Telegram Admin/Owner if configured
    if (notifyAdmin && config.telegram.adminId && botInstance) {
      const userStr = tgId ? `<code>${tgId}</code>` : '<i>System</i>';
      const catBadge = String(category).toUpperCase();
      const text = `📝 <b>[AUDIT LOG: ${catBadge}]</b>\n• <b>Action:</b> <code>${escapeHtml(action)}</code>\n• <b>Triggered by:</b> ${userStr}\n• <b>Details:</b> ${escapeHtml(String(details))}\n• <b>Time:</b> <code>${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</code>`;
      
      botInstance.telegram.sendMessage(config.telegram.adminId, text, { parse_mode: 'HTML' }).catch(err => {
        logger.warn({ err: err.message }, 'Failed to dispatch audit log to admin Telegram');
      });
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to record audit log');
  }
}

/**
 * Query audit logs with pagination and filtering
 */
function getAuditLogs({ limit = 8, page = 1, category = null, tgId = null } = {}) {
  try {
    const db = getDb();
    const offset = Math.max(0, (page - 1) * limit);
    let whereClauses = [];
    let params = [];

    if (category && category !== 'all') {
      whereClauses.push('category = ?');
      params.push(category);
    }
    if (tgId) {
      whereClauses.push('tg_id = ?');
      params.push(tgId);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${whereSql}`).get(...params);
    const total = countRow ? countRow.c : 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows = db.prepare(`
      SELECT * FROM audit_logs
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { logs: rows, total, totalPages, page };
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to get audit logs');
    return { logs: [], total: 0, totalPages: 1, page: 1 };
  }
}

/**
 * Get audit log statistics for the admin dashboard
 */
function getAuditStats() {
  try {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get()?.c || 0;
    const today = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE date(created_at) = date('now')").get()?.c || 0;
    const byCategory = db.prepare('SELECT category, COUNT(*) as c FROM audit_logs GROUP BY category').all();
    return { total, today, byCategory };
  } catch {
    return { total: 0, today: 0, byCategory: [] };
  }
}

/**
 * Record a formal release changelog entry
 */
function addChangelog({ version, title, description }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO changelogs (version, title, description, released_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(version, title, description);
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to add changelog');
  }
}

/**
 * Retrieve system changelogs
 */
function getChangelogs(limit = 10) {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM changelogs ORDER BY id DESC LIMIT ?').all(limit);
  } catch {
    return [];
  }
}

module.exports = {
  setAuditBotInstance,
  logChange,
  getAuditLogs,
  getAuditStats,
  addChangelog,
  getChangelogs
};
