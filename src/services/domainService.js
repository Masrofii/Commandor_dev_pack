'use strict';
const dns = require('dns').promises;
const { getDb } = require('../../database/database');
const { generateVerificationToken } = require('../utils/crypto');
const { isValidDomain } = require('../utils/validation');
const { encrypt, decrypt, maskSecret } = require('../utils/encryption');
const { getProvider } = require('./dns/DnsManager');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

function maskDomain(d) {
  if (!d) return null;
  const { dns_provider_token, ...safe } = d;
  return {
    ...safe,
    has_dns_token: Boolean(dns_provider_token),
    dns_provider_token_masked: dns_provider_token ? maskSecret(decrypt(dns_provider_token) || dns_provider_token) : null
  };
}

function getUserDomains(tgId) {
  const rows = getDb().prepare('SELECT * FROM custom_domains WHERE tg_id=? ORDER BY created_at DESC').all(tgId);
  return rows.map(maskDomain);
}

function getAllDomains(opts = {}) {
  const db = getDb();
  let q = 'SELECT * FROM custom_domains WHERE 1=1';
  const params = [];

  if (opts.search) {
    q += ' AND (domain LIKE ? OR notes LIKE ? OR registrar LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  q += ' ORDER BY created_at DESC';

  const rows = db.prepare(q).all(...params);
  return rows.map(maskDomain);
}

function getDomainById(id) {
  const row = getDb().prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  return maskDomain(row);
}

function addDomain(tgId, domain, options = {}) {
  if (!isValidDomain(domain)) throw new Error('Invalid domain format');
  const cleanDomain = String(domain).trim().toLowerCase();
  const db = getDb();
  const existing = db.prepare('SELECT * FROM custom_domains WHERE domain=?').get(cleanDomain);

  if (existing && existing.tg_id !== tgId) {
    throw new Error('Domain already registered in inventory by another user');
  }

  const encToken = options.dns_provider_token ? encrypt(options.dns_provider_token.trim()) : null;
  const dnsProvider = options.dns_provider || 'manual';
  const registrar = options.registrar || null;
  const dnsZoneId = options.dns_zone_id || null;
  const expiryDate = options.expiry_date || null;
  const notes = options.notes || null;

  if (existing) {
    db.prepare(`
      UPDATE custom_domains
      SET registrar = COALESCE(?, registrar),
          dns_provider = COALESCE(?, dns_provider),
          dns_provider_token = COALESCE(?, dns_provider_token),
          dns_zone_id = COALESCE(?, dns_zone_id),
          expiry_date = COALESCE(?, expiry_date),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(registrar, dnsProvider, encToken, dnsZoneId, expiryDate, notes, existing.id);
    return getDomainById(existing.id);
  }

  const token = generateVerificationToken();
  const info = db.prepare(`
    INSERT INTO custom_domains (
      tg_id, domain, verification_token, registrar, dns_provider,
      dns_provider_token, dns_zone_id, expiry_date, notes,
      dns_status, cert_status, routing_status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'none', 'active', datetime('now'))
  `).run(tgId, cleanDomain, token, registrar, dnsProvider, encToken, dnsZoneId, expiryDate, notes);

  logChange({
    tgId,
    category: 'domains',
    action: 'domain_added',
    details: `Added domain "${cleanDomain}" to inventory with ${dnsProvider} DNS provider.`,
    metadata: { domain: cleanDomain, dnsProvider }
  }).catch(() => {});

  return getDomainById(info.lastInsertRowid);
}

function updateDomain(id, tgId, updates = {}) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM custom_domains WHERE id=?').get(id);
  if (!current) throw new Error(`Domain #${id} not found`);

  const sets = [];
  const params = [];

  if (updates.registrar !== undefined) {
    sets.push('registrar = ?');
    params.push(updates.registrar);
  }
  if (updates.dns_provider !== undefined) {
    sets.push('dns_provider = ?');
    params.push(updates.dns_provider);
  }
  if (updates.dns_provider_token !== undefined && updates.dns_provider_token !== '') {
    sets.push('dns_provider_token = ?');
    params.push(encrypt(updates.dns_provider_token));
  }
  if (updates.dns_zone_id !== undefined) {
    sets.push('dns_zone_id = ?');
    params.push(updates.dns_zone_id);
  }
  if (updates.expiry_date !== undefined) {
    sets.push('expiry_date = ?');
    params.push(updates.expiry_date);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    params.push(updates.notes);
  }
  if (updates.active !== undefined) {
    sets.push('active = ?');
    params.push(updates.active ? 1 : 0);
  }
  if (updates.dns_status !== undefined) {
    sets.push('dns_status = ?');
    params.push(updates.dns_status);
  }
  if (updates.cert_status !== undefined) {
    sets.push('cert_status = ?');
    params.push(updates.cert_status);
  }
  if (updates.routing_status !== undefined) {
    sets.push('routing_status = ?');
    params.push(updates.routing_status);
  }

  if (sets.length > 0) {
    params.push(id);
    db.prepare(`UPDATE custom_domains SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  return getDomainById(id);
}

async function verifyDomain(d) {
  const db = getDb();
  const domainRecord = typeof d === 'object' ? d : db.prepare('SELECT * FROM custom_domains WHERE id=?').get(d);
  if (!domainRecord) throw new Error('Domain not found');

  try {
    const records = await dns.resolveTxt(domainRecord.domain);
    const flat = records.map(r => r.join('')).flat();
    const found = flat.some(r => r.includes(domainRecord.verification_token));
    db.prepare("UPDATE custom_domains SET dns_checked_at=datetime('now') WHERE id=?").run(domainRecord.id);

    if (found) {
      db.prepare(`
        UPDATE custom_domains
        SET verified=1, verified_at=datetime('now'), active=1, dns_status='verified'
        WHERE id=?
      `).run(domainRecord.id);

      const health = await checkDomainDnsHealth(domainRecord.domain, domainRecord.verification_token);
      return { verified: true, health };
    }
    return { verified: false, message: 'TXT verification record not found in DNS.' };
  } catch (err) {
    return { verified: false, message: `DNS resolution failed: ${err.message}` };
  }
}

async function checkDomainDnsHealth(domain, verificationToken = null) {
  const result = {
    domain,
    ownership: { status: 'unknown', record: null, message: '' },
    mx: { status: 'unknown', records: [], message: '' },
    spf: { status: 'unknown', record: null, message: '' },
    dmarc: { status: 'unknown', record: null, message: '' },
    overallStatus: 'pending'
  };

  try {
    const txts = await dns.resolveTxt(domain);
    const flat = txts.map(r => r.join('')).flat();
    if (verificationToken) {
      const foundToken = flat.some(r => r.includes(verificationToken));
      result.ownership = {
        status: foundToken ? 'verified' : 'missing',
        record: flat.find(r => r.includes(verificationToken)) || null,
        message: foundToken ? 'Verification token found in DNS.' : `Missing TXT token: ${verificationToken}`
      };
    } else {
      result.ownership = { status: 'verified', record: null, message: 'Verified' };
    }

    const spfRecord = flat.find(r => r.startsWith('v=spf1'));
    if (spfRecord) {
      result.spf = { status: 'valid', record: spfRecord, message: 'Valid SPF record detected.' };
    } else {
      result.spf = { status: 'missing', record: null, message: 'No SPF record found (v=spf1).' };
    }
  } catch (err) {
    result.ownership = { status: 'missing', record: null, message: `DNS lookup failed: ${err.message}` };
    result.spf = { status: 'missing', record: null, message: 'No TXT records found.' };
  }

  try {
    const mxs = await dns.resolveMx(domain);
    if (mxs && mxs.length > 0) {
      mxs.sort((a, b) => a.priority - b.priority);
      result.mx = {
        status: 'valid',
        records: mxs,
        message: `${mxs.length} MX record(s) resolved (Primary: ${mxs[0].exchange})`
      };
    } else {
      result.mx = { status: 'missing', records: [], message: 'No MX records found.' };
    }
  } catch (err) {
    result.mx = { status: 'missing', records: [], message: `MX resolution failed: ${err.message}` };
  }

  try {
    const dmarcTxts = await dns.resolveTxt(`_dmarc.${domain}`);
    const flatDmarc = dmarcTxts.map(r => r.join('')).flat();
    const dmarcRec = flatDmarc.find(r => r.startsWith('v=DMARC1'));
    if (dmarcRec) {
      result.dmarc = { status: 'valid', record: dmarcRec, message: 'DMARC policy found.' };
    } else {
      result.dmarc = { status: 'warning', record: null, message: `No DMARC record at _dmarc.${domain}.` };
    }
  } catch {
    result.dmarc = { status: 'warning', record: null, message: `No DMARC record found at _dmarc.${domain}` };
  }

  if (result.ownership.status === 'verified') {
    result.overallStatus = result.mx.status === 'valid' ? 'healthy' : 'warning';
  } else {
    result.overallStatus = 'misconfigured';
  }

  return result;
}

function deleteDomain(id, tgId, isAdmin = false) {
  const db = getDb();
  let q = 'DELETE FROM custom_domains WHERE id=?';
  const params = [id];
  if (!isAdmin && tgId) {
    q += ' AND tg_id=?';
    params.push(tgId);
  }
  return db.prepare(q).run(...params).changes > 0;
}

module.exports = {
  getUserDomains,
  getAllDomains,
  getDomainById,
  addDomain,
  updateDomain,
  verifyDomain,
  deleteDomain,
  checkDomainDnsHealth
};
