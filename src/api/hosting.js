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
  testNodeConnection,
  enrollNode,
  updateNode,
  provisionNodeServices,
  validateBulkNodes,
  testAndProvisionNode,
  provisionNodesBulk,
  listNodes,
  deleteNode,
  getNodeById,
  getNodeWithSites,
  pingNode,
  executeNodeCommand,
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
    const success = await deleteSite(id, req.tgId, checkIsAdmin(req.tgId));
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
    const { search } = req.query;
    const nodes = listNodes({ onlyActive: false, search });
    res.json({ nodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Non-destructive SSH connection test (Admin Only)
router.post('/nodes/test', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    let { connection_string, host, port, username, password, private_key, host_key_fingerprint } = req.body;
    if (connection_string) {
      const parsed = parseNodeConnectionString(connection_string);
      host = parsed.host;
      port = parsed.port;
      username = parsed.username;
      password = parsed.password;
    }

    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required.' });
    }

    const result = await testNodeConnection({
      host,
      port: port || 22,
      username,
      password,
      privateKey: private_key,
      hostKeyFingerprint: host_key_fingerprint
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Add / Enroll a server node (Admin Only)
router.post('/nodes', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required to register hosting nodes.' });
    }

    let { connection_string, host, port, username, password, private_key, auth_method, host_key_fingerprint, name, labels, groups, notes, http_port, public_url, test_connection } = req.body;

    if (connection_string) {
      const parsed = parseNodeConnectionString(connection_string);
      host = parsed.host;
      port = parsed.port;
      username = parsed.username;
      password = parsed.password;
      if (parsed.name && !name) name = parsed.name;
    }

    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required (or supply connection_string as host:port:user:pass)' });
    }

    const node = await enrollNode({
      host,
      port: port || 22,
      username,
      password,
      privateKey: private_key,
      authMethod: auth_method,
      hostKeyFingerprint: host_key_fingerprint,
      name,
      labels,
      groups,
      notes,
      httpPort: http_port || 8080,
      publicUrl: public_url,
      testBeforeSave: test_connection !== false
    });

    res.status(201).json(node);
  } catch (err) {
    res.status(400).json({ error: `Node enrollment failed: ${err.message}` });
  }
});

// Update Node (Admin Only)
router.put('/nodes/:id', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const updated = updateNode(id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle Node Status (Active/Disabled)
router.patch('/nodes/:id/status', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const { is_active } = req.body;
    const updated = updateNode(id, { is_active: Boolean(is_active) });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Explicitly Provision Node Services (Admin Only)
router.post('/nodes/:id/provision', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const result = await provisionNodeServices(id, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: `Provisioning failed: ${err.message}` });
  }
});

// Validate Bulk Import (Dry-Run / Preview)
router.post('/nodes/bulk/validate', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const { connection_strings, nodes } = req.body;
    const input = connection_strings || nodes;
    if (!input) {
      return res.status(400).json({ error: 'connection_strings or nodes array is required' });
    }
    const preview = validateBulkNodes(input);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

    const result = await provisionNodesBulk(input, {
      autoProvisionFtp: req.body.auto_provision_ftp || req.body.autoProvisionFtp || false,
      detectFtp: req.body.detect_ftp !== false
    });
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

// Node FTP Management Endpoints
router.post('/nodes/bulk/ftp/detect', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const results = await bulkDetectFtp(req.body.node_ids);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/nodes/:id/ftp', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const info = getNodeFtpInfo(id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/detect', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const node = getNodeById(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const result = await detectNodeFtp({
      host: node.host,
      port: node.ftp_port || 21,
      nodeId: id
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/provision', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const result = await provisionNodeFtp(id, req.body, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/control', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const { action } = req.body;
    const result = await controlNodeFtp(id, action, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/test', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const result = await testNodeFtpCredentials(id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/nodes/:id/ftp/users', (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const users = listNodeFtpUsers(id);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nodes/:id/ftp/users', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const user = await createNodeFtpUser(id, req.body, req.tgId);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/nodes/:id/ftp/users/:userId', async (req, res) => {
  try {
    if (!checkIsAdmin(req.tgId)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    const result = await deleteNodeFtpUser(id, userId, req.tgId);
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
