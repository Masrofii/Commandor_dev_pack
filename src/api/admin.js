'use strict';
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getDb } = require('../../database/database');
const { getDatabaseStats, getProcessStats, getCounters } = require('../monitoring/metrics');
const { getAllSubdomainsAdmin, updateSubdomain, deleteSubdomain, getSubdomainById } = require('../services/subdomainService');
const { getAllSitesAdmin, deleteSite, getSecurityLogs } = require('../services/hostingService');
const { listNodes, testAndProvisionNode, provisionNodesBulk, deleteNode, parseNodeConnectionString } = require('../services/nodeManagerService');

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

    res.json({
      database: db,
      process: proc,
      counters: ctrs,
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

// Users Management
router.get('/users', (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const db = getDb();
    let q = 'SELECT tg_id, username, first_name, role, is_banned, created_at, last_seen_at, storage_used, storage_limit, alias_limit FROM users';
    const p = [];
    if (search) {
      q += ' WHERE username LIKE ? OR first_name LIKE ? OR CAST(tg_id AS TEXT) LIKE ?';
      p.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    p.push(parseInt(limit, 10), offset);

    const countQuery = search
      ? 'SELECT COUNT(*) as c FROM users WHERE username LIKE ? OR first_name LIKE ? OR CAST(tg_id AS TEXT) LIKE ?'
      : 'SELECT COUNT(*) as c FROM users';
    const total = db.prepare(countQuery).get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []))?.c || 0;

    res.json({ users: db.prepare(q).all(...p), total, page: parseInt(page, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:tgId', (req, res) => {
  try {
    const db = getDb();
    const allowed = ['is_banned', 'role', 'alias_limit', 'storage_limit'];
    const updates = [], values = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        updates.push(`${k}=?`);
        values.push(req.body[k]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.tgId);
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE tg_id=?`).run(...values);
    db.prepare('INSERT INTO audit_logs(tg_id, action, resource, resource_id, details, ip_address) VALUES(?,?,?,?,?,?)')
      .run(req.user.tg_id, 'admin.user.update', 'user', req.params.tgId, JSON.stringify(req.body), req.ip);
    res.json({ status: 'updated' });
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

router.post('/nodes', async (req, res) => {
  try {
    let { connection_string, host, port, username, password, private_key, name, http_port, public_url } = req.body;
    if (connection_string) {
      const parsed = parseNodeConnectionString(connection_string);
      host = parsed.host;
      port = parsed.port;
      username = parsed.username;
      password = parsed.password;
    }
    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required (or connection_string as host:port:user:pass)' });
    }
    const node = await testAndProvisionNode({
      host,
      port: port || 22,
      username,
      password,
      privateKey: private_key,
      name,
      httpPort: http_port || 8080,
      publicUrl: public_url
    });
    res.status(201).json(node);
  } catch (err) {
    res.status(400).json({ error: `Node setup failed: ${err.message}` });
  }
});

router.post('/nodes/bulk', async (req, res) => {
  try {
    const { connection_strings, nodes } = req.body;
    const input = connection_strings || nodes;
    if (!input || (Array.isArray(input) && input.length === 0)) {
      return res.status(400).json({ error: 'Connection strings or nodes array is required' });
    }
    const result = await provisionNodesBulk(input);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: `Bulk node provisioning failed: ${err.message}` });
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
