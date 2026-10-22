'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuthOrApiKey, requireAdmin } = require('../middleware/auth');
const {
  getTOS,
  getPlan,
  getUserSites,
  getSiteById,
  checkUserLimits,
  deploySite,
  deleteSite,
  getAllSitesAdmin,
  getSecurityLogs
} = require('../services/hostingService');
const {
  parseNodeConnectionString,
  parseBulkConnectionStrings,
  testAndProvisionNode,
  provisionNodesBulk,
  listNodes,
  deleteNode,
  getNodeById,
  getNodeWithSites,
  pingNode,
  executeNodeCommand
} = require('../services/nodeManagerService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max upload
});

function checkIsAdmin(tgId) {
  if (!tgId) return false;
  try {
    const { getDb } = require('../../database/database');
    const user = getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(tgId);
    const config = require('../../config/config');
    return (user?.role === 'admin') || (config.telegram?.adminId && (String(tgId) === String(config.telegram.adminId)));
  } catch {
    return false;
  }
}

// Terms of Service & Acceptable Use Policy (Public)
router.get('/tos', (req, res) => {
  res.json(getTOS());
});

// Plans & Quotas (Public)
router.get('/plans', (req, res) => {
  const { getDb } = require('../../database/database');
  const plans = getDb().prepare('SELECT * FROM hosting_plans ORDER BY max_sites ASC').all();
  res.json({ plans });
});

router.use(requireAuthOrApiKey(['hosting:manage']));

// Current User's Limits & Usage
router.get('/limits', (req, res) => {
  try {
    const limits = checkUserLimits(req.tgId);
    res.json(limits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List User's Sites
router.get('/sites', (req, res) => {
  try {
    const isAdmin = checkIsAdmin(req.tgId);
    const sites = getUserSites(req.tgId, isAdmin);
    res.json({ sites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Site Details
router.get('/sites/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkIsAdmin(req.tgId);
    const site = getSiteById(id, req.tgId, isAdmin);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deploy / Update Site (JSON or Multipart ZIP)
router.post('/sites', upload.single('zipFile'), async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const siteType = body.site_type || body.siteType || 'static';
    const planId = body.plan_id || body.planId || 'free';
    const rawHtml = body.raw_html || body.rawHtml;
    const tosAccepted = body.tos_accepted === true || body.tos_accepted === 'true' || body.tos_accepted === 1;

    let files = [];
    if (body.files) {
      files = typeof body.files === 'string' ? JSON.parse(body.files) : body.files;
    }

    const zipBuffer = req.file?.buffer || null;

    if (!name) {
      return res.status(400).json({ error: 'Site name is required' });
    }

    if (!tosAccepted) {
      return res.status(400).json({ error: 'You must accept the Hosting Terms of Service (Anti-Abuse Agreement).' });
    }

    const site = await deploySite({
      tgId: req.tgId,
      name,
      siteType,
      files,
      zipBuffer,
      rawHtml,
      planId,
      tosAccepted,
      ipAddress: req.ip
    });

    res.status(201).json(site);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Site
router.delete('/sites/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = await deleteSite(id, req.tgId);
    if (!success) return res.status(404).json({ error: 'Site not found or unauthorized' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Node Management (Owner/Admin Only) ---

// List all nodes (Admin Only)
router.get('/nodes', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required to view hosting nodes.' });
    }
    const nodes = listNodes({ onlyActive: false });
    res.json({ nodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add / Provision a server node ("host:port:user:pass and does everything")
router.post('/nodes', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required to register hosting nodes.' });
    }

    let { connection_string, host, port, username, password, private_key, name, http_port, public_url } = req.body;

    if (connection_string) {
      const parsed = parseNodeConnectionString(connection_string);
      host = parsed.host;
      port = parsed.port;
      username = parsed.username;
      password = parsed.password;
    }

    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required (or supply connection_string as host:port:user:pass)' });
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

// Bulk Provision Server Nodes (Admin Only)
router.post('/nodes/bulk', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

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

// Get Node details with deployed sites
router.get('/nodes/:id', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const node = getNodeWithSites(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ping / Re-test Node Connectivity and Health
router.post('/nodes/:id/ping', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const result = await pingNode(id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Execute Command on Node (Admin only)
router.post('/nodes/:id/exec', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    const result = await executeNodeCommand(id, command, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a Node
router.delete('/nodes/:id', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const id = parseInt(req.params.id, 10);
    deleteNode(id);
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Security Logs (Admin or User)
router.get('/security-logs', (req, res) => {
  try {
    const { page, limit } = req.query;
    const isAdmin = checkIsAdmin(req.tgId);

    const result = getSecurityLogs({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      tgId: isAdmin ? null : req.tgId
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
