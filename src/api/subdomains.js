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
const {
  validateSubdomainStep,
  previewSubdomainWizard,
  deploySubdomainWizard,
  verifySubdomainRoute,
  repairSubdomainRoute,
  safeDeleteSubdomain
} = require('../services/subdomainWizardService');
const { createAlias, getUserAliases } = require('../services/aliasService');
const { getDb } = require('../../database/database');
const config = require('../../config/config');
const { assertSafeOutboundUrl } = require('../utils/ssrfGuard');

router.use(requireAuthOrApiKey(['subdomains:manage']));

function isAdminRequest(req) {
  return req.user?.role === 'admin' ||
    Boolean(config.telegram?.adminId && String(req.tgId) === String(config.telegram.adminId));
}

function getWizardOptions(body = {}) {
  const destinationTarget = body.destination_target !== undefined
    ? body.destination_target
    : (body.web_target !== undefined
      ? body.web_target
      : (body.target_url !== undefined ? body.target_url : body.internal_port));

  return {
    subdomain: body.subdomain,
    baseDomain: body.base_domain,
    destinationType: body.destination_type !== undefined ? body.destination_type : body.web_mode,
    destinationTarget,
    dnsContent: body.dns_content !== undefined ? body.dns_content : null,
    nodeId: body.node_id !== undefined ? body.node_id : body.destination_node_id,
    applicationId: body.application_id,
    enableDns: body.enable_dns !== false,
    recordType: body.dns_record_type || body.record_type || 'A',
    enableProxy: body.enable_proxy !== false,
    enableHttps: body.enable_https === true || body.enable_https === 'true',
    enableWebsocket: body.enable_websocket !== false,
    securityHeaders: body.security_headers === true || body.security_headers === 'true',
    forceHttpsRedirect: body.force_https_redirect !== false,
    webCustomBody: body.web_custom_body !== undefined ? body.web_custom_body : body.static_body,
    webCustomContentType: body.web_custom_content_type,
    emailCatchAll: body.email_catch_all !== false,
    confirmationAccepted: body.confirmation_accepted === true || body.confirmation_accepted === 'true'
  };
}

function getAccessibleSubdomain(req, id) {
  return getSubdomainById(id, isAdminRequest(req) ? null : req.tgId);
}

async function validateUpdatePayload(body) {
  if (body?.email_webhook_url) {
    await assertSafeOutboundUrl(body.email_webhook_url, { label: 'Email webhook URL' });
  }
  // The legacy claim/update API can store a proxy target that the built-in
  // edge router forwards to. Loopback is allowed for local applications, but
  // link-local metadata and private network ranges are not.
  if (typeof body?.web_target === 'string' && /^https?:\/\//i.test(body.web_target.trim())) {
    await assertSafeOutboundUrl(body.web_target.trim(), {
      label: 'Web target',
      allowLoopback: true
    });
  }
}

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

// List available parent base domains and server DNS IP for subdomain creation
router.get('/bases', (req, res) => {
  try {
    const isAdmin = isAdminRequest(req);
    const bases = getAvailableBaseDomains(req.tgId, isAdmin);
    const defaultDomain = config.domains?.defaultDomain || bases[0] || null;
    res.json({
      defaultDomain,
      baseDomains: bases,
      serverIp: config.server.publicIp,
      proxyMode: config.proxy?.mode || 'auto',
      ready: bases.length > 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check subdomain availability
router.get('/check/:name', (req, res) => {
  const name = req.params.name;
  try {
    const clean = validateSubdomainName(name, isAdminRequest(req));
    const bases = getAvailableBaseDomains(req.tgId, isAdminRequest(req));
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

    if (email_webhook_url) {
      await assertSafeOutboundUrl(email_webhook_url, { label: 'Email webhook URL' });
    }
    if (typeof web_target === 'string' && /^https?:\/\//i.test(web_target.trim())) {
      await assertSafeOutboundUrl(web_target.trim(), {
        label: 'Web target',
        allowLoopback: true
      });
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
    const sub = getAccessibleSubdomain(req, id);
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
    await validateUpdatePayload(req.body);
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
    await validateUpdatePayload(req.body);
    const updated = updateSubdomain(id, req.tgId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Subdomain Guided Creation Wizard Endpoints ---

// Step 2: Validate subdomain name and check conflicts
router.post('/wizard/validate', (req, res) => {
  try {
    const { subdomain, base_domain } = req.body;
    const result = validateSubdomainStep({
      subdomain,
      baseDomain: base_domain,
      tgId: req.tgId,
      isAdmin: isAdminRequest(req)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// Steps 4-6: Preview planned DNS, proxy, and TLS changes
router.post('/wizard/preview', async (req, res) => {
  try {
    const preview = await previewSubdomainWizard({
      ...getWizardOptions(req.body),
      tgId: req.tgId,
      isAdmin: isAdminRequest(req)
    });

    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Step 7: Review and atomic deploy of subdomain
router.post('/wizard/deploy', async (req, res) => {
  try {
    const result = await deploySubdomainWizard({
      ...getWizardOptions(req.body),
      tgId: req.tgId,
      isAdmin: isAdminRequest(req)
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Step 8 / Recheck: Independent Multi-Stage Verification
router.post('/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getAccessibleSubdomain(req, id);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });
    const verification = await verifySubdomainRoute(id);
    res.json(verification);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Repair / Regenerate reverse proxy route
router.post('/:id/repair-route', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getAccessibleSubdomain(req, id);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });
    const result = await repairSubdomainRoute(id, req.tgId, isAdminRequest(req));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete / Release subdomain with granular DNS & Data options
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    // Accept both snake_case (dashboard payload) and camelCase (API clients).
    const deleteDns = body.deleteDns ?? body.delete_dns ?? false;
    const deleteSiteData = body.deleteSiteData ?? body.delete_site_data ?? false;
    const isAdmin = isAdminRequest(req);
    const result = await safeDeleteSubdomain(
      id,
      req.tgId,
      { deleteDns: Boolean(deleteDns), deleteSiteData: Boolean(deleteSiteData) },
      isAdmin
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// View captured HTTP web requests (for webhook/collector mode)
router.get('/:id/requests', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit, 10) || 50;
    const isAdmin = isAdminRequest(req);
    const requests = getSubdomainWebRequests(id, isAdmin ? null : req.tgId, limit);
    res.json({ requests, count: requests.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List aliases created under this subdomain
router.get('/:id/aliases', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sub = getAccessibleSubdomain(req, id);
    if (!sub) return res.status(404).json({ error: 'Subdomain not found' });

    const db = getDb();
    const aliases = db.prepare(`
      SELECT * FROM aliases
      WHERE domain = ? COLLATE NOCASE AND tg_id = ?
      ORDER BY created_at DESC
    `).all(sub.full_domain, sub.tg_id);

    res.json({ subdomain: sub.full_domain, aliases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create explicit alias under this subdomain (e.g. hello@mysub.example.com)
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
