'use strict';
const dns = require('dns').promises;
const CloudflareDnsProvider = require('./CloudflareDnsProvider');
const ManualDnsProvider = require('./ManualDnsProvider');
const { getDb } = require('../../../database/database');
const { decrypt } = require('../../utils/encryption');
const logger = require('../../monitoring/logger');

function getProvider(providerType = 'manual', apiToken = null) {
  const cleanType = String(providerType || 'manual').toLowerCase();
  if (cleanType === 'cloudflare') {
    const rawToken = apiToken || process.env.CLOUDFLARE_API_TOKEN;
    if (!rawToken) {
      // Fallback to manual if token not available
      return new ManualDnsProvider();
    }
    const resolvedToken = decrypt(rawToken) || rawToken;
    return new CloudflareDnsProvider(resolvedToken);
  }
  return new ManualDnsProvider();
}

/**
 * Check DNS propagation across authoritative or standard resolvers
 */
async function checkDnsPropagation(hostname, expectedType = 'A', expectedValue = null) {
  const result = {
    hostname,
    type: expectedType.toUpperCase(),
    resolved: false,
    values: [],
    matchesExpected: false,
    error: null,
    checkedAt: new Date().toISOString()
  };

  try {
    const cleanHost = String(hostname).trim().toLowerCase();
    const type = expectedType.toUpperCase();

    if (type === 'A') {
      const ips = await dns.resolve4(cleanHost);
      result.values = ips;
      result.resolved = ips && ips.length > 0;
      if (expectedValue) {
        result.matchesExpected = ips.includes(expectedValue.trim());
      }
    } else if (type === 'AAAA') {
      const ips = await dns.resolve6(cleanHost);
      result.values = ips;
      result.resolved = ips && ips.length > 0;
      if (expectedValue) {
        result.matchesExpected = ips.includes(expectedValue.trim());
      }
    } else if (type === 'CNAME') {
      const cnames = await dns.resolveCname(cleanHost);
      result.values = cnames;
      result.resolved = cnames && cnames.length > 0;
      if (expectedValue) {
        result.matchesExpected = cnames.some(c => c.toLowerCase().replace(/\.$/, '') === expectedValue.toLowerCase().replace(/\.$/, ''));
      }
    } else if (type === 'TXT') {
      const txts = await dns.resolveTxt(cleanHost);
      result.values = txts.map(t => t.join(''));
      result.resolved = result.values.length > 0;
      if (expectedValue) {
        result.matchesExpected = result.values.some(v => v.includes(expectedValue));
      }
    } else {
      // General resolve
      const addresses = await dns.resolve(cleanHost, type);
      result.values = Array.isArray(addresses) ? addresses : [addresses];
      result.resolved = result.values.length > 0;
    }
  } catch (err) {
    result.error = err.code || err.message;
    result.resolved = false;
  }

  return result;
}

/**
 * Detect DNS conflict before creating/updating record.
 * Specifically: CNAME at same name as A/AAAA, or duplicate exact records.
 */
function detectConflicts(hostname, newType, existingRecords = []) {
  const cleanHost = String(hostname).trim().toLowerCase();
  const cleanType = String(newType).trim().toUpperCase();

  const matchingHostRecords = existingRecords.filter(r =>
    String(r.name).trim().toLowerCase() === cleanHost
  );

  const conflicts = [];

  for (const r of matchingHostRecords) {
    const existingType = String(r.type).toUpperCase();
    if (cleanType === 'CNAME' && (existingType === 'A' || existingType === 'AAAA' || existingType === 'CNAME')) {
      conflicts.push(`CNAME conflict: Record "${r.name}" (${existingType} -> ${r.content}) already exists. CNAME records cannot coexist with other address records at the same hostname.`);
    } else if ((cleanType === 'A' || cleanType === 'AAAA') && existingType === 'CNAME') {
      conflicts.push(`Address conflict: Hostname "${r.name}" is already a CNAME pointing to ${r.content}. Remove the CNAME before adding an ${cleanType} record.`);
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts
  };
}

module.exports = {
  getProvider,
  checkDnsPropagation,
  detectConflicts
};
