'use strict';
const { getDb } = require('../../database/database');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const RESERVED_SUBDOMAINS = new Set([
  'admin', 'administrator', 'api', 'mail', 'email', 'web', 'www', 'root', 'bot',
  'mx', 'smtp', 'imap', 'pop', 'pop3', 'ns', 'ns1', 'ns2', 'app', 'auth',
  'status', 'test', 'dev', 'stage', 'staging', 'support', 'billing', 'secure',
  'system', 'help', 'internal', 'webhook', 'webhooks', 'cdn', 'static',
  'dashboard', 'panel', 'login', 'signup', 'register', 'account', 'user', 'users',
  'null', 'undefined', 'postmaster', 'hostmaster', 'abuse', 'ftp', 'ssh', 'ssl',
  'autoconfig', 'autodiscover', 'cpanel', 'whm', 'webmail', 'mailer', 'owner'
]);

const VALID_WEB_MODES = new Set(['proxy', 'redirect', 'static', 'webhook', 'landing']);

function validateSubdomainName(name, isAdmin = false) {
  if (!name || typeof name !== 'string') {
    throw new Error('Subdomain name is required');
  }
  const clean = name.toLowerCase().trim();
  if (clean.length < 3 || clean.length > 63) {
    throw new Error('Subdomain must be between 3 and 63 characters long');
  }
  const validRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!validRegex.test(clean)) {
    throw new Error('Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)');
  }
  if (!isAdmin && RESERVED_SUBDOMAINS.has(clean)) {
    throw new Error(`The subdomain '${clean}' is reserved and cannot be claimed`);
  }
  return clean;
}

function getAvailableBaseDomains() {
  const list = config.domains?.list || [];
  if (list.length > 0) return list;
  return [config.domains?.defaultDomain || 'commandor.my.id'];
}

function claimSubdomain({
  tgId,
  subdomain,
  baseDomain = null,
  emailCatchAll = 1,
  emailWebhookUrl = null,
  webEnabled = 1,
  webMode = 'landing',
  webTarget = null,
  webCustomBody = null,
  webCustomStatus = 200,
  webCustomContentType = 'text/html; charset=utf-8',
  webNotifyTelegram = 1
}) {
  const db = getDb();
  const user = db.prepare('SELECT tg_id, role FROM users WHERE tg_id=?').get(tgId);
  if (!user) throw new Error('User not found');

  const isAdmin = (user.role === 'admin') || (config.telegram?.adminId && (String(tgId) === String(config.telegram.adminId)));
  const cleanSub = validateSubdomainName(subdomain, isAdmin);

  const allowedBases = getAvailableBaseDomains();
  const targetBase = baseDomain ? baseDomain.toLowerCase().trim() : allowedBases[0];
  if (!allowedBases.includes(targetBase)) {
    throw new Error(`Base domain '${targetBase}' is not supported. Allowed: ${allowedBases.join(', ')}`);
  }

  const fullDomain = `${cleanSub}.${targetBase}`.toLowerCase();

  const existing = db.prepare('SELECT id, tg_id FROM subdomains WHERE full_domain=? COLLATE NOCASE').get(fullDomain);
  if (existing) {
    throw new Error(`Subdomain '${fullDomain}' is already claimed`);
  }

  if (webMode && !VALID_WEB_MODES.has(webMode)) {
    throw new Error(`Invalid web mode '${webMode}'. Allowed modes: ${Array.from(VALID_WEB_MODES).join(', ')}`);
  }

  if ((webMode === 'proxy' || webMode === 'redirect') && webTarget) {
    try {
      const u = new URL(webTarget);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('Web target must use http:// or https://');
      }
    } catch (e) {
      throw new Error(`Invalid web target URL: ${e.message}`);
    }
  }

  const stmt = db.prepare(`
    INSERT INTO subdomains (
      tg_id, subdomain, full_domain, base_domain, active,
      email_catch_all, email_webhook_url,
      web_enabled, web_mode, web_target, web_custom_body,
      web_custom_status, web_custom_content_type, web_notify_telegram,
      emails_received, web_requests_count, created_at
    ) VALUES (
      ?, ?, ?, ?, 1,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      0, 0, datetime('now')
    )
  `);

  const info = stmt.run(
    tgId,
    cleanSub,
    fullDomain,
    targetBase,
    emailCatchAll ? 1 : 0,
    emailWebhookUrl || null,
    webEnabled ? 1 : 0,
    webMode,
    webTarget || null,
    webCustomBody || null,
    webCustomStatus || 200,
    webCustomContentType || 'text/html; charset=utf-8',
    webNotifyTelegram ? 1 : 0
  );

  logger.info({ tgId, fullDomain, subdomainId: info.lastInsertRowid }, 'Subdomain claimed successfully');
  logChange({
    tgId,
    category: 'subdomain',
    action: 'subdomain_created',
    details: `Claimed subdomain ${fullDomain} (${webMode} mode)`,
    metadata: { subdomain: cleanSub, fullDomain, webMode }
  }).catch(() => {});
  return getSubdomainById(info.lastInsertRowid);
}

function getUserSubdomains(tgId, opts = {}) {
  const db = getDb();
  const { page = 1, limit = 50, active = null } = opts;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM subdomains WHERE tg_id=?';
  const params = [tgId];

  if (active !== null) {
    query += ' AND active=?';
    params.push(active ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const subdomains = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM subdomains WHERE tg_id=?').get(tgId).count;

  return { subdomains, total, page, limit };
}

function getSubdomainById(id, tgId = null) {
  const db = getDb();
  let query = 'SELECT * FROM subdomains WHERE id=?';
  const params = [id];

  if (tgId !== null) {
    query += ' AND tg_id=?';
    params.push(tgId);
  }

  return db.prepare(query).get(...params);
}

function getSubdomainByFullDomain(fullDomain) {
  if (!fullDomain) return null;
  const db = getDb();
  return db.prepare('SELECT * FROM subdomains WHERE full_domain=? COLLATE NOCASE').get(fullDomain.toLowerCase().trim());
}

function updateSubdomain(id, tgId, updates = {}) {
  const db = getDb();
  const sub = getSubdomainById(id, tgId);
  if (!sub) throw new Error('Subdomain not found or unauthorized');

  const allowedFields = [
    'active',
    'email_catch_all',
    'email_webhook_url',
    'web_enabled',
    'web_mode',
    'web_target',
    'web_custom_body',
    'web_custom_status',
    'web_custom_content_type',
    'web_notify_telegram'
  ];

  const setClauses = [];
  const values = [];

  if (updates.web_mode !== undefined) {
    if (!VALID_WEB_MODES.has(updates.web_mode)) {
      throw new Error(`Invalid web mode '${updates.web_mode}'. Allowed: ${Array.from(VALID_WEB_MODES).join(', ')}`);
    }
  }

  if (updates.web_target !== undefined && updates.web_target !== null && updates.web_target !== '') {
    try {
      const u = new URL(updates.web_target);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('Web target must use http:// or https://');
      }
    } catch (e) {
      throw new Error(`Invalid web target URL: ${e.message}`);
    }
  }

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field}=?`);
      if (['active', 'email_catch_all', 'web_enabled', 'web_notify_telegram'].includes(field)) {
        values.push(updates[field] ? 1 : 0);
      } else if (field === 'web_custom_status') {
        values.push(parseInt(updates[field], 10) || 200);
      } else {
        values.push(updates[field]);
      }
    }
  }

  if (setClauses.length === 0) {
    return sub;
  }

  values.push(id);
  db.prepare(`UPDATE subdomains SET ${setClauses.join(', ')} WHERE id=?`).run(...values);
  logger.info({ id, tgId, updates }, 'Subdomain configuration updated');
  logChange({
    tgId,
    category: 'subdomain',
    action: 'subdomain_updated',
    details: `Updated subdomain #${id} (${sub.full_domain}): ${Object.keys(updates).join(', ')}`,
    metadata: { id, updates }
  }).catch(() => {});
  return getSubdomainById(id, tgId);
}

function deleteSubdomain(id, tgId) {
  const db = getDb();
  const sub = getSubdomainById(id, tgId);
  if (!sub) return false;

  const tx = db.transaction(() => {
    // Also deactivate or remove aliases linked to this full domain
    db.prepare('DELETE FROM aliases WHERE domain=? COLLATE NOCASE AND tg_id=?').run(sub.full_domain, tgId);
    db.prepare('DELETE FROM subdomain_web_requests WHERE subdomain_id=?').run(id);
    db.prepare('DELETE FROM subdomains WHERE id=?').run(id);
  });

  tx();
  logger.info({ id, tgId, fullDomain: sub.full_domain }, 'Subdomain deleted');
  logChange({
    tgId,
    category: 'subdomain',
    action: 'subdomain_deleted',
    details: `Deleted subdomain ${sub.full_domain}`,
    metadata: { id, fullDomain: sub.full_domain }
  }).catch(() => {});
  return true;
}

function recordSubdomainEmail(fullDomain) {
  if (!fullDomain) return;
  const db = getDb();
  db.prepare(`
    UPDATE subdomains
    SET emails_received = emails_received + 1,
        last_active_at = datetime('now')
    WHERE full_domain = ? COLLATE NOCASE
  `).run(fullDomain.toLowerCase().trim());
}

function recordWebRequest(subdomainId, { method, path, queryParams, headers, body, ip }) {
  const db = getDb();
  const stringHeaders = typeof headers === 'object' ? JSON.stringify(headers) : (headers || null);
  const stringQuery = typeof queryParams === 'object' ? JSON.stringify(queryParams) : (queryParams || null);
  const stringBody = typeof body === 'object' ? JSON.stringify(body) : (body ? String(body).slice(0, 50000) : null);

  const stmt = db.prepare(`
    INSERT INTO subdomain_web_requests (subdomain_id, method, path, query_params, headers, body, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(subdomainId, method || 'GET', path || '/', stringQuery, stringHeaders, stringBody, ip || null);

  db.prepare(`
    UPDATE subdomains
    SET web_requests_count = web_requests_count + 1,
        last_active_at = datetime('now')
    WHERE id = ?
  `).run(subdomainId);

  return info.lastInsertRowid;
}

function getSubdomainWebRequests(subdomainId, tgId, limit = 50) {
  const db = getDb();
  const sub = getSubdomainById(subdomainId, tgId);
  if (!sub) throw new Error('Subdomain not found or unauthorized');

  const rows = db.prepare(`
    SELECT * FROM subdomain_web_requests
    WHERE subdomain_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(subdomainId, Math.min(limit, 200));

  return rows.map(r => ({
    ...r,
    headers: r.headers ? safeJsonParse(r.headers) : {},
    query_params: r.query_params ? safeJsonParse(r.query_params) : {}
  }));
}

function safeJsonParse(val) {
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

function getAllSubdomainsAdmin(opts = {}) {
  const db = getDb();
  const { page = 1, limit = 50, search = null } = opts;
  const offset = (page - 1) * limit;

  let query = 'SELECT s.*, u.username FROM subdomains s LEFT JOIN users u ON s.tg_id = u.tg_id WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (s.subdomain LIKE ? OR s.full_domain LIKE ? OR u.username LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const subdomains = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM subdomains').get().count;

  return { subdomains, total, page, limit };
}

module.exports = {
  RESERVED_SUBDOMAINS,
  VALID_WEB_MODES,
  validateSubdomainName,
  getAvailableBaseDomains,
  claimSubdomain,
  getUserSubdomains,
  getSubdomainById,
  getSubdomainByFullDomain,
  updateSubdomain,
  deleteSubdomain,
  recordSubdomainEmail,
  recordWebRequest,
  getSubdomainWebRequests,
  getAllSubdomainsAdmin
};
