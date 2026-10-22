'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUserDomains,
  getAllDomains,
  getDomainById,
  addDomain,
  updateDomain,
  verifyDomain,
  deleteDomain,
  checkDomainDnsHealth
} = require('../services/domainService');
const { getProvider, detectConflicts } = require('../services/dns/DnsManager');
const { getDb } = require('../../database/database');
const { body, validationResult } = require('express-validator');
const { logChange } = require('../services/auditLogger');

function isUserAdmin(tgId) {
  if (!tgId) return false;
  try {
    const user = getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(tgId);
    const config = require('../../config/config');
    return (user?.role === 'admin') || (config.telegram?.adminId && (String(tgId) === String(config.telegram.adminId)));
  } catch {
    return false;
  }
}

router.use(requireAuth);

// List domains (user domains or all inventory if admin)
router.get('/', (req, res) => {
  const isAdmin = isUserAdmin(req.tgId);
  const showAll = isAdmin && req.query.all === 'true';
  const { search } = req.query;

  if (showAll || isAdmin) {
    return res.json(getAllDomains({ search }));
  }
  res.json(getUserDomains(req.tgId));
});

// Get domain details
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = getDomainById(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const isAdmin = isUserAdmin(req.tgId);
  if (d.tg_id !== req.tgId && !isAdmin) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(d);
});

// Domain health check (TXT, MX, SPF, DMARC)
router.get('/:id/health', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const isAdmin = isUserAdmin(req.tgId);
  if (d.tg_id !== req.tgId && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  const health = await checkDomainDnsHealth(d.domain, d.verification_token);
  res.json(health);
});

// Add domain to inventory
router.post(
  '/',
  [body('domain').isString().isLength({ min: 3, max: 253 })],
  async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    try {
      const { domain, registrar, dns_provider, dns_provider_token, dns_zone_id, expiry_date, notes } = req.body;
      const d = addDomain(req.tgId, domain.toLowerCase().trim(), {
        registrar,
        dns_provider,
        dns_provider_token,
        dns_zone_id,
        expiry_date,
        notes
      });

      res.status(201).json({
        ...d,
        instructions: {
          txt: `Add TXT record with value: ${d.verification_token}`,
          mx: 'Set MX records according to your DNS or mail routing provider.'
        }
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Update domain details
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const isAdmin = isUserAdmin(req.tgId);
  if (d.tg_id !== req.tgId && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  try {
    const updated = updateDomain(id, req.tgId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Verify domain ownership
router.post('/:id/verify', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const isAdmin = isUserAdmin(req.tgId);
  if (d.tg_id !== req.tgId && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  res.json(await verifyDomain(d));
});

// List records from DNS provider
router.get('/:id/records', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  if (!d) return res.status(404).json({ error: 'Domain not found' });
  const isAdmin = isUserAdmin(req.tgId);
  if (d.tg_id !== req.tgId && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  try {
    const provider = getProvider(d.dns_provider, d.dns_provider_token);
    let zoneId = d.dns_zone_id;
    if (!zoneId && d.dns_provider === 'cloudflare') {
      const zoneInfo = await provider.getZone(d.domain);
      zoneId = zoneInfo.id;
      getDb().prepare('UPDATE custom_domains SET dns_zone_id=? WHERE id=?').run(zoneId, id);
    }

    if (!zoneId) {
      return res.json({ provider: d.dns_provider, records: [] });
    }

    const records = await provider.listRecords(zoneId, req.query);
    res.json({ provider: d.dns_provider, zoneId, records });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create DNS record via provider
router.post(
  '/:id/records',
  [
    body('type').isString().isIn(['A', 'AAAA', 'CNAME', 'TXT', 'MX']),
    body('name').isString(),
    body('content').isString()
  ],
  async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    const id = parseInt(req.params.id, 10);
    const d = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
    if (!d) return res.status(404).json({ error: 'Domain not found' });
    const isAdmin = isUserAdmin(req.tgId);
    if (d.tg_id !== req.tgId && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    try {
      const provider = getProvider(d.dns_provider, d.dns_provider_token);
      let zoneId = d.dns_zone_id;
      if (!zoneId && d.dns_provider === 'cloudflare') {
        const zoneInfo = await provider.getZone(d.domain);
        zoneId = zoneInfo.id;
        getDb().prepare('UPDATE custom_domains SET dns_zone_id=? WHERE id=?').run(zoneId, id);
      }

      // Check conflicts
      const existing = await provider.listRecords(zoneId, { name: req.body.name });
      const conflictCheck = detectConflicts(req.body.name, req.body.type, existing);
      if (conflictCheck.hasConflict) {
        return res.status(409).json({ error: conflictCheck.conflicts.join(' ') });
      }

      const created = await provider.createRecord(zoneId, {
        type: req.body.type,
        name: req.body.name,
        content: req.body.content,
        ttl: req.body.ttl || 300,
        proxied: req.body.proxied || false
      });

      logChange({
        tgId: req.tgId,
        category: 'dns',
        action: 'dns_record_created',
        details: `Created ${req.body.type} record for "${req.body.name}" -> ${req.body.content}`,
        metadata: { domain: d.domain, record: created }
      }).catch(() => {});

      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Delete domain from inventory
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const isAdmin = isUserAdmin(req.tgId);
  if (!deleteDomain(id, req.tgId, isAdmin)) {
    return res.status(404).json({ error: 'Domain not found or unauthorized' });
  }
  res.json({ status: 'deleted', id });
});

module.exports = router;
