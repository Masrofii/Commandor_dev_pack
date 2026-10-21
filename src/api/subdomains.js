'use strict';
const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../middleware/auth');
const {
  claimSubdomain,
  getUserSubdomains,
  getSubdomainById,
  updateSubdomain,
  deleteSubdomain,
  getSubdomainWebRequests,
  validateSubdomainName,
  getAvailableBaseDomains,
  RESERVED_SUBDOMAINS
} = require('../services/subdomainService');
const { createAlias, getUserAliases } = require('../services/aliasService');
const { getDb } = require('../../database/database');

router.use(requireAuthOrApiKey(['subdomains:manage']));

// List all claimed subdomains for the authenticated user
router.get('/', async (req, res) => {
  try {
    const { page, limit, active } = req.query;
    const result = getUserSubdomains(req.tgId, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      active: active !== undefined ? (active === 'true' || active === '1') : null
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check subdomain availability
router.get('/check/:name', (req, res) => {
  const name = req.params.name;
  try {
    const clean = validateSubdomainName(name, req.user?.role === 'admin');
    const bases = getAvailableBaseDomains();
    const db = getDb();
    const results = bases.map(base => {
      const full = `${clean}.${base}`.toLowerCase();
      const existing = db.prepare('SELECT 1 FROM subdomains WHERE full_domain=? COLLATE NOCASE').get(full);
      return {
        full_domain: full,
        base_domain: base,
        available: !existing
      };
    });
    res.json({ subdomain: clean, check: results });
  } catch (err) {
    res.status(400).json({ available: false, error: err.message });
  }
});

// Claim a new subdomain with full custom configuration
router.post('/', async (req, res) => {
  try {
    const {
      subdomain,
      base_domain,
      email_catch_all,
      email_webhook_url,
      web_enabled,
      web_mode,
      web_target,
      web_custom_body,
      web_custom_status,
      web_custom_content_type,
      web_notify_telegram
    } = req.body;

    if (!subdomain) {
      return res.status(400).json({ error: 'subdomain is required' });
    }

    const record = claimSubdomain({
      tgId: req.tgId,
      subdomain,
      baseDomain: base_domain,
      emailCatchAll: email_catch_all !== undefined ? Boolean(email_catch_all) : 1,
      emailWebhookUrl: email_webhook_url,
      webEnabled: web_enabled !== undefined ? Boolean(web_enabled) : 1,
      webMode: web_mode || 'landing',
      webTarget: web_target,
      webCustomBody: web_custom_body,
      webCustomStatus: web_custom_status,
      webCustomContentType: web_custom_content_type,
      webNotifyTelegram: web_notify_telegram !== undefined ? Boolean(web_notify_telegram) : 1
    });

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get single subdomain by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getSubdomainById(id, req.tgId);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update subdomain configuration (Email routing, Web routing, Webhooks, Target, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = updateSubdomain(id, req.tgId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Support PUT as alias for updating
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = updateSubdomain(id, req.tgId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete / Release subdomain
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = deleteSubdomain(id, req.tgId);
    if (!success) return res.status(404).json({ error: 'Subdomain not found or unauthorized' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View captured HTTP web requests (for webhook/collector mode)
router.get('/:id/requests', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit, 10) || 50;
    const requests = getSubdomainWebRequests(id, req.tgId, limit);
    res.json({ requests, count: requests.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List aliases created under this subdomain
router.get('/:id/aliases', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getSubdomainById(id, req.tgId);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });

    const db = getDb();
    const aliases = db.prepare(`
      SELECT * FROM aliases
      WHERE domain = ? COLLATE NOCASE AND tg_id = ?
      ORDER BY created_at DESC
    `).all(sub.full_domain, req.tgId);

    res.json({ subdomain: sub.full_domain, aliases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create explicit alias under this subdomain (e.g. hello@mysub.commandor.my.id)
router.post('/:id/aliases', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getSubdomainById(id, req.tgId);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });

    const { customName, label, type } = req.body;
    const alias = createAlias({
      tgId: req.tgId,
      domain: sub.full_domain,
      type: type || 'custom',
      label: label || `Alias on ${sub.subdomain}`,
      customName: customName || null
    });

    res.status(201).json(alias);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
