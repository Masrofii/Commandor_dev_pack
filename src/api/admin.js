'use strict';
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getDb } = require('../../database/database');
const { getDatabaseStats, getProcessStats, getCounters } = require('../monitoring/metrics');
const { getAllSubdomainsAdmin, updateSubdomain, deleteSubdomain, getSubdomainById } = require('../services/subdomainService');
const { getAllSitesAdmin, deleteSite, getSecurityLogs } = require('../services/hostingService');
const {
  listNodes,
  enrollNode,
  updateNode,
  bulkAddNodes,
  validateBulkNodes,
  testNodeConnection,
  deleteNode,
  parseNodeConnectionString,
  pingNode,
  executeNodeCommand,
  getNodeWithSites,
  getNodeById,
  detectNodeFtp,
  provisionNodeFtp,
  controlNodeFtp,
  getNodeFtpInfo,
  createNodeFtpUser,
  deleteNodeFtpUser,
  listNodeFtpUsers,
  testNodeFtpCredentials,
  bulkDetectFtp
} = require('../services/nodeManagerService');
const { listUsers, getUserDetails, banUser, unbanUser, setSubscription, listSubscriptionPlans } = require('../services/userService');
const { createRedeemCode, listRedeemCodes, revokeRedeemCode, deleteRedeemCode, listRedeemLogs } = require('../services/redeemService');
const { getGlobalStorageMetrics, getUserComprehensiveStorageStats, formatBytes } = require('../services/quotaService');

router.use(requireAdmin);

// System Overview & Stats
router.get('/stats', async (req, res) => {
  try {
    const [db, proc, ctrs] = await Promise.all([
      getDatabaseStats(),
      Promise.resolve(getProcessStats()),
      Promise.resolve(getCounters())
    ]);

    const database = getDb();
    const subdomainsCount = database.prepare('SELECT COUNT(*) as c FROM subdomains').get()?.c || 0;
    const sitesCount = database.prepare('SELECT COUNT(*) as c FROM hosting_sites').get()?.c || 0;
    const nodesCount = database.prepare('SELECT COUNT(*) as c FROM hosting_nodes').get()?.c || 0;
    const threatsCount = database.prepare('SELECT COUNT(*) as c FROM hosting_security_logs').get()?.c || 0;

    const globalStorage = getGlobalStorageMetrics();

    res.json({
      database: db,
      process: proc,
      counters: ctrs,
      globalStorage,
      overview: {
        users: db.users,
        aliases: db.aliases,
        emails: db.emails,
        unread: db.unreadEmails,
        subdomains: subdomainsCount,
        sites: sitesCount,
        nodes: nodesCount,
        threatsBlocked: threatsCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users Management & Advanced Filtering
router.get('/users', (req, res) => {
  try {
    const { page = 1, limit = 50, search, role, status, plan } = req.query;
    const result = listUsers({ page, limit, search, role, status, plan });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:tgId', (req, res) => {
  try {
    const user = getUserDetails(req.params.tgId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:tgId/ban', (req, res) => {
  try {
    const result = banUser(req.params.tgId, {
      reason: req.body.reason,
      adminTgId: req.user.tg_id,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:tgId/unban', (req, res) => {
  try {
    const result = unbanUser(req.params.tgId, {
      adminTgId: req.user.tg_id,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:tgId/subscription', (req, res) => {
  try {
    const { planId = 'free', durationDays = 30, isLifetime = false } = req.body;
    const result = setSubscription(req.params.tgId, {
      planId,
      durationDays,
      isLifetime,
      adminTgId: req.user.tg_id,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subscription-plans', (req, res) => {
  try {
    res.json({ plans: listSubscriptionPlans() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:tgId', (req, res) => {
  try {
    const db = getDb();
    const targetTgId = req.params.tgId;
    const currentUser = db.prepare('SELECT tg_id, email_storage_used, email_storage_limit, hosting_storage_used, hosting_storage_limit, storage_limit FROM users WHERE tg_id=?').get(targetTgId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const allowed = [
      'is_banned', 'role', 'alias_limit', 'storage_limit',
      'email_storage_limit', 'hosting_storage_limit',
      'custom_domain_limit', 'application_limit', 'node_limit'
    ];
    const updates = [], values = [];
    const warnings = [];

    // Parse integer limits safely
    if (req.body.email_storage_limit !== undefined) {
      const newEmailLimit = parseInt(req.body.email_storage_limit, 10);
      req.body.email_storage_limit = newEmailLimit;
      if (newEmailLimit > 0 && newEmailLimit < currentUser.email_storage_used) {
        warnings.push(`Email storage limit reduced below current usage (${formatBytes(currentUser.email_storage_used)} used vs ${formatBytes(newEmailLimit)} limit). Existing data is preserved, but new incoming messages will be rejected.`);
      }
    }

    if (req.body.hosting_storage_limit !== undefined) {
      const newHostingLimit = parseInt(req.body.hosting_storage_limit, 10);
      req.body.hosting_storage_limit = newHostingLimit;
      if (newHostingLimit > 0 && newHostingLimit < currentUser.hosting_storage_used) {
        warnings.push(`Hosting storage limit reduced below current usage (${formatBytes(currentUser.hosting_storage_used)} used vs ${formatBytes(newHostingLimit)} limit). Existing sites are preserved, but new uploads will be rejected.`);
      }
    }

    // Sync legacy storage_limit if email or hosting limit changed
    if (req.body.email_storage_limit !== undefined || req.body.hosting_storage_limit !== undefined) {
      const eLim = req.body.email_storage_limit !== undefined ? req.body.email_storage_limit : (currentUser.email_storage_limit || 1073741824);
      const hLim = req.body.hosting_storage_limit !== undefined ? req.body.hosting_storage_limit : (currentUser.hosting_storage_limit || 5368709120);
      req.body.storage_limit = eLim + hLim;
    }

    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        updates.push(`${k}=?`);
        values.push(req.body[k]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(targetTgId);
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE tg_id=?`).run(...values);
    db.prepare('INSERT INTO audit_logs(tg_id, action, resource, resource_id, details, ip_address) VALUES(?,?,?,?,?,?)')
      .run(req.user.tg_id, 'admin.user.update', 'user', targetTgId, JSON.stringify(req.body), req.ip);
    
    res.json({
      status: 'updated',
      warnings: warnings.length ? warnings : undefined,
      user: db.prepare('SELECT tg_id, role, alias_limit, storage_limit, email_storage_limit, hosting_storage_limit FROM users WHERE tg_id=?').get(targetTgId)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:tgId/storage', (req, res) => {
  try {
    const stats = getUserComprehensiveStorageStats(req.params.tgId);
    if (!stats) return res.status(404).json({ error: 'User not found' });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/storage/metrics', (req, res) => {
  try {
    const thresholds = {};
    if (req.query.warning) thresholds.warning = parseInt(req.query.warning, 10);
    if (req.query.high) thresholds.high = parseInt(req.query.high, 10);
    if (req.query.critical) thresholds.critical = parseInt(req.query.critical, 10);
    const metrics = getGlobalStorageMetrics(thresholds);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redeem Codes Administration
router.get('/redeem-codes', (req, res) => {
  try {
    const codes = listRedeemCodes({
      search: req.query.search,
      activeOnly: req.query.activeOnly === 'true'
    });
    res.json({ codes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/redeem-codes', (req, res) => {
  try {
    const code = createRedeemCode({
      ...req.body,
      adminTgId: req.user.tg_id
    });
    res.status(201).json(code);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/redeem-codes/:id/toggle', (req, res) => {
  try {
    const result = revokeRedeemCode(req.params.id, req.user.tg_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/redeem-codes/:id', (req, res) => {
  try {
    const ok = deleteRedeemCode(req.params.id, req.user.tg_id);
    res.json({ success: ok });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/redeem-codes/logs', (req, res) => {
  try {
    const logs = listRedeemLogs({ limit: req.query.limit || 50 });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System-Wide Live Email Feed
router.get('/emails', (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const db = getDb();

    let q = `
      SELECT e.id, e.alias_id, e.sender, e.sender_name, e.subject, e.text_body, e.received_at, e.is_read, e.spam_score, e.spam_classification,
             a.address as alias_address, a.tg_id as user_tg_id, u.username as user_username
      FROM emails e
      LEFT JOIN aliases a ON e.alias_id = a.id
      LEFT JOIN users u ON a.tg_id = u.tg_id
      WHERE 1=1
    `;
    const p = [];
    if (search) {
      q += ' AND (e.subject LIKE ? OR e.sender LIKE ? OR a.address LIKE ? OR e.text_body LIKE ?)';
      p.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY e.id DESC LIMIT ? OFFSET ?';
    p.push(parseInt(limit, 10), offset);

    const total = db.prepare('SELECT COUNT(*) as c FROM emails').get()?.c || 0;
    const emails = db.prepare(q).all(...p);

    res.json({ emails, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/emails/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM emails WHERE id=?').run(id);
    db.prepare('INSERT INTO audit_logs(tg_id, action, resource, resource_id, details, ip_address) VALUES(?,?,?,?,?,?)')
      .run(req.user.tg_id, 'admin.email.delete', 'email', String(id), null, req.ip);
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System-Wide Aliases
router.get('/aliases', (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const db = getDb();

    let q = `
      SELECT a.*, u.username as user_username, u.first_name as user_first_name
      FROM aliases a
      LEFT JOIN users u ON a.tg_id = u.tg_id
      WHERE 1=1
    `;
    const p = [];
    if (search) {
      q += ' AND (a.address LIKE ? OR u.username LIKE ?)';
      p.push(`%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY a.id DESC LIMIT ? OFFSET ?';
    p.push(parseInt(limit, 10), offset);

    const total = db.prepare('SELECT COUNT(*) as c FROM aliases').get()?.c || 0;
    const aliases = db.prepare(q).all(...p);

    res.json({ aliases, total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System-Wide Subdomains
router.get('/subdomains', async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    res.json(getAllSubdomainsAdmin({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      search
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/subdomains/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getSubdomainById(id);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });
    const updated = updateSubdomain(id, sub.tg_id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/subdomains/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getSubdomainById(id);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });
    deleteSubdomain(id, sub.tg_id);
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System-Wide Hosted Sites
router.get('/sites', (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const result = getAllSitesAdmin({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      search
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = await deleteSite(id, null, true);
    if (!success) return res.status(404).json({ error: 'Site not found' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server Nodes Management
router.get('/nodes', (req, res) => {
  try {
    const nodes = listNodes({ onlyActive: false });
    res.json({ nodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test SSH connection without enrolling
router.post('/nodes/test', async (req, res) => {
  try {
    const result = await testNodeConnection(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Enroll node securely with encrypted credentials
router.post('/nodes', async (req, res) => {
  try {
    const node = await enrollNode(req.body);
    res.status(201).json(node);
  } catch (err) {
    res.status(400).json({ error: `Node enrollment failed: ${err.message}` });
  }
});

// Dry-run validate bulk connection strings
router.post('/nodes/bulk/validate', (req, res) => {
  try {
    const { connection_strings } = req.body;
    if (!connection_strings) {
      return res.status(400).json({ error: 'connection_strings is required' });
    }
    const result = validateBulkNodes(connection_strings);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/bulk', async (req, res) => {
  try {
    const { connection_strings, nodes } = req.body;
    const input = connection_strings || nodes;
    if (!input || (Array.isArray(input) && input.length === 0)) {
      return res.status(400).json({ error: 'Connection strings or nodes array is required' });
    }
    const result = await bulkAddNodes(input);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: `Bulk node enrollment failed: ${err.message}` });
  }
});

router.get('/nodes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const node = getNodeWithSites(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nodes/:id/ping', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await pingNode(id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/exec', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    const result = await executeNodeCommand(id, command, req.user?.tg_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Node FTP Endpoints
router.post('/nodes/bulk/ftp/detect', async (req, res) => {
  try {
    const results = await bulkDetectFtp(req.body.node_ids);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/nodes/:id/ftp', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const info = getNodeFtpInfo(id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/detect', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const node = getNodeById(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const result = await detectNodeFtp({ host: node.host, port: node.ftp_port || 21, nodeId: id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/provision', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await provisionNodeFtp(id, req.body, req.user?.tg_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/control', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action } = req.body;
    const result = await controlNodeFtp(id, action, req.user?.tg_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/test', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await testNodeFtpCredentials(id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/nodes/:id/ftp/users', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const users = listNodeFtpUsers(id);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await createNodeFtpUser(id, req.body, req.user?.tg_id);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/nodes/:id/ftp/users/:userId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    const result = await deleteNodeFtpUser(id, userId, req.user?.tg_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/nodes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    deleteNode(id);
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Security & Threat Logs
router.get('/security-logs', (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = getSecurityLogs({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      tgId: null
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram Broadcast Announcement
router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const users = getDb().prepare('SELECT tg_id FROM users WHERE is_banned=0').all();
    const bot = require('../bot/bot').getBot();
    let sent = 0;
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.tg_id, message, { parse_mode: 'HTML' });
        sent++;
      } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    getDb().prepare('INSERT INTO audit_logs(tg_id, action, resource, details, ip_address) VALUES(?,?,?,?,?)')
      .run(req.user.tg_id, 'admin.broadcast', 'broadcast', JSON.stringify({ message: message.slice(0, 100), sent, total: users.length }), req.ip);
    res.json({ sent, total: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs
router.get('/logs', (req, res) => {
  try {
    const { page = 1, limit = 50, action, user } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const db = getDb();
    let q = 'SELECT * FROM audit_logs WHERE 1=1';
    const p = [];
    if (action) {
      q += ' AND action=?';
      p.push(action);
    }
    if (user) {
      q += ' AND tg_id=?';
      p.push(parseInt(user, 10));
    }
    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    p.push(parseInt(limit, 10), offset);
    res.json({ logs: db.prepare(q).all(...p) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Database Vacuum & Maintenance
router.post('/system/vacuum', (req, res) => {
  try {
    const db = getDb();
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
    db.prepare('PRAGMA optimize').run();
    res.json({ status: 'ok', message: 'WAL checkpoint and database optimization completed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
