'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getDb } = require('../../database/database');
const { getProvider, checkDnsPropagation, detectConflicts } = require('./dns/DnsManager');
const {
  generateNginxVhost,
  applyRouteConfig,
  removeRouteConfig,
  checkTlsCertificate
} = require('./reverseProxyService');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');
const config = require('../../config/config');

const RESERVED_SUBDOMAINS = new Set([
  'admin', 'auth', 'root', 'login', 'gateway',
  'ns1', 'ns2', 'cpanel', 'whm', 'internal', 'localhost'
]);

function validateSubdomainSyntax(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') {
    throw new Error('Subdomain prefix is required');
  }

  const clean = subdomain.trim().toLowerCase();

  if (clean.length < 2 || clean.length > 63) {
    throw new Error('Subdomain length must be between 2 and 63 characters');
  }

  // RFC 1123 hostname label syntax
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(clean)) {
    throw new Error('Subdomain can only contain letters, numbers, and hyphens (cannot start or end with a hyphen)');
  }

  if (RESERVED_SUBDOMAINS.has(clean)) {
    throw new Error(`The subdomain name "${clean}" is reserved for platform infrastructure`);
  }

  return clean;
}

/**
 * Step 2: Validate subdomain name and detect conflicts
 */
function validateSubdomainStep({ subdomain, baseDomain }) {
  const cleanSub = validateSubdomainSyntax(subdomain);
  const cleanBase = String(baseDomain || config.domains?.defaultDomain || 'commandor.my.id').trim().toLowerCase();
  const fullDomain = `${cleanSub}.${cleanBase}`;

  const db = getDb();

  // Check if exists in subdomains table
  const existingSub = db.prepare('SELECT id, full_domain FROM subdomains WHERE full_domain=? COLLATE NOCASE').get(fullDomain);
  if (existingSub) {
    throw new Error(`Hostname "${fullDomain}" is already in use by another routing service.`);
  }

  // Check if exists in hosting_sites table
  const existingSite = db.prepare('SELECT id, full_domain FROM hosting_sites WHERE full_domain=? COLLATE NOCASE').get(fullDomain);
  if (existingSite) {
    throw new Error(`Hostname "${fullDomain}" is already in use by an active website deployment.`);
  }

  return {
    valid: true,
    subdomain: cleanSub,
    baseDomain: cleanBase,
    fullDomain
  };
}

/**
 * Preview Planned Changes (Steps 4 - 7)
 */
async function previewSubdomainWizard({
  subdomain,
  baseDomain,
  destinationType = 'internal_service',
  destinationTarget = null,
  nodeId = null,
  applicationId = null,
  enableDns = true,
  recordType = 'A',
  enableProxy = true,
  enableHttps = false
}) {
  const { fullDomain, cleanSub, cleanBase } = {
    cleanSub: validateSubdomainSyntax(subdomain),
    cleanBase: String(baseDomain || 'commandor.my.id').trim().toLowerCase(),
    fullDomain: `${subdomain.trim().toLowerCase()}.${String(baseDomain || 'commandor.my.id').trim().toLowerCase()}`
  };

  const db = getDb();
  const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain=? COLLATE NOCASE').get(cleanBase);

  // 1. Resolve destination target
  let resolvedTarget = destinationTarget;
  let targetIp = '127.0.0.1';
  let targetPort = 8080;

  if (destinationType === 'node_app' && nodeId) {
    const node = db.prepare('SELECT host, port, http_port FROM hosting_nodes WHERE id=?').get(nodeId);
    if (!node) throw new Error(`Node #${nodeId} not found`);
    targetIp = node.host;
    targetPort = destinationTarget ? (parseInt(destinationTarget, 10) || node.http_port) : node.http_port;
    resolvedTarget = `${targetIp}:${targetPort}`;
  } else if (destinationType === 'internal_service') {
    targetPort = parseInt(destinationTarget, 10) || 3000;
    targetIp = '127.0.0.1';
    resolvedTarget = `127.0.0.1:${targetPort}`;
  } else if (destinationType === 'external_url') {
    if (!resolvedTarget || !/^https?:\/\//i.test(resolvedTarget)) {
      throw new Error('External URL must start with http:// or https://');
    }
  }

  // 2. Formulate proposed DNS changes
  const proposedDns = {
    action: enableDns ? 'create' : 'none',
    provider: domainRecord?.dns_provider || 'manual',
    recordType: recordType.toUpperCase(),
    hostname: fullDomain,
    content: recordType.toUpperCase() === 'A' ? targetIp : resolvedTarget,
    ttl: 300,
    hasConflict: false,
    conflicts: []
  };

  if (domainRecord && domainRecord.dns_provider !== 'manual') {
    try {
      const provider = getProvider(domainRecord.dns_provider, domainRecord.dns_provider_token);
      let zoneId = domainRecord.dns_zone_id;
      if (!zoneId) {
        const zoneInfo = await provider.getZone(domainRecord.domain);
        zoneId = zoneInfo.id;
      }
      const existing = await provider.listRecords(zoneId, { name: fullDomain });
      const conflictCheck = detectConflicts(fullDomain, proposedDns.recordType, existing);
      proposedDns.hasConflict = conflictCheck.hasConflict;
      proposedDns.conflicts = conflictCheck.conflicts;
    } catch {}
  }

  // 3. Formulate proposed Proxy route
  let proposedProxy = null;
  if (enableProxy && destinationType !== 'dns_only') {
    proposedProxy = generateNginxVhost({
      serverName: fullDomain,
      destinationType,
      targetHost: targetIp,
      targetPort,
      upstreamUrl: destinationType === 'external_url' ? resolvedTarget : null,
      enableSsl: enableHttps
    });
  }

  return {
    fullDomain,
    subdomain: cleanSub,
    baseDomain: cleanBase,
    destination: {
      type: destinationType,
      target: resolvedTarget,
      nodeId,
      applicationId
    },
    dns: proposedDns,
    proxy: {
      enabled: enableProxy && destinationType !== 'dns_only',
      upstreamName: proposedProxy?.upstreamName || null,
      proxyPassTarget: proposedProxy?.proxyPassTarget || null,
      configPreview: proposedProxy?.config || null
    },
    https: {
      enabled: enableHttps,
      mode: enableHttps ? 'automated_acme_or_custom' : 'disabled'
    }
  };
}

/**
 * Step 7: Review & Deploy Subdomain Wizard
 */
async function deploySubdomainWizard({
  tgId,
  subdomain,
  baseDomain,
  destinationType = 'internal_service',
  destinationTarget = null,
  nodeId = null,
  applicationId = null,
  enableDns = true,
  recordType = 'A',
  enableProxy = true,
  enableHttps = false,
  confirmationAccepted = false
}) {
  if (!confirmationAccepted) {
    throw new Error('You must review and explicitly confirm the deployment of planned routing changes.');
  }

  const preview = await previewSubdomainWizard({
    subdomain,
    baseDomain,
    destinationType,
    destinationTarget,
    nodeId,
    applicationId,
    enableDns,
    recordType,
    enableProxy,
    enableHttps
  });

  if (preview.dns.hasConflict) {
    throw new Error(`DNS Conflict detected: ${preview.dns.conflicts.join(' ')}`);
  }

  const db = getDb();
  const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain=? COLLATE NOCASE').get(preview.baseDomain);

  let dnsRecordId = null;
  let dnsStatus = 'pending';

  // 1. Create DNS Record if enabled & provider configured
  if (enableDns && domainRecord && domainRecord.dns_provider !== 'manual') {
    try {
      const provider = getProvider(domainRecord.dns_provider, domainRecord.dns_provider_token);
      let zoneId = domainRecord.dns_zone_id;
      if (!zoneId) {
        const zoneInfo = await provider.getZone(domainRecord.domain);
        zoneId = zoneInfo.id;
        db.prepare('UPDATE custom_domains SET dns_zone_id=? WHERE id=?').run(zoneId, domainRecord.id);
      }

      const rec = await provider.createRecord(zoneId, {
        type: preview.dns.recordType,
        name: preview.fullDomain,
        content: preview.dns.content,
        ttl: preview.dns.ttl
      });

      dnsRecordId = rec.id;
      dnsStatus = 'propagated';
    } catch (err) {
      dnsStatus = 'failed';
      logger.warn({ err: err.message, domain: preview.fullDomain }, 'DNS record auto-creation failed');
    }
  } else if (!enableDns) {
    dnsStatus = 'none';
  } else {
    dnsStatus = 'manual';
  }

  // 2. Generate and Apply Reverse Proxy Route if enabled
  let proxyStatus = 'unconfigured';
  let routeConfigPath = null;
  if (enableProxy && destinationType !== 'dns_only' && preview.proxy.configPreview) {
    try {
      const applied = await applyRouteConfig({
        subdomainId: null,
        serverName: preview.fullDomain,
        configContent: preview.proxy.configPreview,
        userTgId: tgId
      });
      proxyStatus = 'active';
      routeConfigPath = applied.filePath;
    } catch (err) {
      proxyStatus = 'failed';
      logger.error({ err: err.message, domain: preview.fullDomain }, 'Proxy route generation failed');
    }
  }

  // 3. Persist in database
  const info = db.prepare(`
    INSERT INTO subdomains (
      tg_id, domain_id, node_id, application_id,
      subdomain, full_domain, base_domain, active,
      destination_type, destination_target,
      dns_record_type, dns_record_value, dns_record_id, dns_status,
      proxy_status, proxy_config_path, https_status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    tgId,
    domainRecord?.id || null,
    nodeId || null,
    applicationId || null,
    preview.subdomain,
    preview.fullDomain,
    preview.baseDomain,
    preview.destination.type,
    preview.destination.target,
    preview.dns.recordType,
    preview.dns.content,
    dnsRecordId,
    dnsStatus,
    proxyStatus,
    routeConfigPath,
    enableHttps ? 'pending' : 'disabled'
  );

  const subdomainId = info.lastInsertRowid;

  // Link route to subdomainId
  if (proxyStatus === 'active') {
    db.prepare('UPDATE proxy_routes SET subdomain_id=? WHERE server_name=?').run(subdomainId, preview.fullDomain);
  }

  logChange({
    tgId,
    category: 'subdomains',
    action: 'subdomain_wizard_deployed',
    details: `Deployed subdomain "${preview.fullDomain}" -> ${preview.destination.type} (${preview.destination.target})`,
    metadata: { subdomainId, fullDomain: preview.fullDomain, dnsStatus, proxyStatus }
  }).catch(() => {});

  // Run initial verification check
  const verification = await verifySubdomainRoute(subdomainId);

  return {
    subdomain: getSubdomainById(subdomainId),
    verification
  };
}

function getSubdomainById(id) {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subdomains WHERE id=?').get(id);
  if (!sub) return null;
  return {
    ...sub,
    last_verification_results: sub.last_verification_results ? JSON.parse(sub.last_verification_results) : null
  };
}

/**
 * Step 8: Multi-Stage Verification Check
 */
async function verifySubdomainRoute(subdomainId) {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subdomains WHERE id=?').get(subdomainId);
  if (!sub) throw new Error(`Subdomain #${subdomainId} not found`);

  const results = {
    fullDomain: sub.full_domain,
    timestamp: new Date().toISOString(),
    dns: {
      status: 'pending',
      resolved: false,
      values: [],
      error: null,
      guidance: ''
    },
    routing: {
      status: 'pending',
      reachable: false,
      statusCode: null,
      error: null,
      guidance: ''
    },
    https: {
      status: 'disabled',
      active: false,
      daysRemaining: null,
      issuer: null,
      error: null,
      guidance: ''
    },
    overallHealth: 'unknown'
  };

  // 1. Check DNS resolution
  try {
    const dnsCheck = await checkDnsPropagation(sub.full_domain, sub.dns_record_type || 'A', sub.dns_record_value);
    results.dns.resolved = dnsCheck.resolved;
    results.dns.values = dnsCheck.values;
    results.dns.error = dnsCheck.error;

    if (dnsCheck.resolved) {
      results.dns.status = 'passed';
      results.dns.guidance = 'DNS record resolves correctly across nameservers.';
    } else {
      results.dns.status = 'failed';
      results.dns.guidance = `DNS record for ${sub.full_domain} not yet resolving (${dnsCheck.error || 'NXDOMAIN'}). Please allow a few minutes for propagation or verify your authoritative DNS settings.`;
    }
  } catch (err) {
    results.dns.status = 'failed';
    results.dns.error = err.message;
    results.dns.guidance = 'Failed to execute DNS query.';
  }

  // 2. Check Routing Reachability
  if (sub.destination_target && sub.destination_type !== 'dns_only') {
    try {
      let testTarget = sub.destination_target;
      if (!/^https?:\/\//i.test(testTarget)) {
        testTarget = `http://${testTarget}`;
      }
      const parsedUrl = new URL(testTarget);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqPromise = new Promise((resolve) => {
        const testReq = client.get(testTarget, { timeout: 5000 }, (res) => {
          results.routing.statusCode = res.statusCode;
          results.routing.reachable = res.statusCode < 500;
          results.routing.status = res.statusCode < 500 ? 'passed' : 'warning';
          results.routing.guidance = `Endpoint responded with HTTP ${res.statusCode}. Upstream target is reachable.`;
          resolve();
        });

        testReq.on('error', (err) => {
          results.routing.reachable = false;
          results.routing.status = 'failed';
          results.routing.error = err.message;
          results.routing.guidance = `Could not reach upstream target ${sub.destination_target} (${err.message}). Check that your application is running and listening on the designated port.`;
          resolve();
        });

        testReq.on('timeout', () => {
          testReq.destroy();
          results.routing.reachable = false;
          results.routing.status = 'failed';
          results.routing.error = 'Connection timeout';
          results.routing.guidance = 'Upstream target timed out after 5000ms. Ensure firewall allows traffic.';
          resolve();
        });
      });

      await reqPromise;
    } catch (err) {
      results.routing.status = 'failed';
      results.routing.error = err.message;
    }
  } else {
    results.routing.status = 'skipped';
    results.routing.guidance = 'DNS-only mode: HTTP reverse proxy routing is disabled.';
  }

  // 3. Check HTTPS / TLS
  if (sub.https_status && sub.https_status !== 'disabled') {
    try {
      const tlsCheck = await checkTlsCertificate(sub.full_domain);
      results.https.active = tlsCheck.active;
      results.https.issuer = tlsCheck.issuer || null;
      results.https.daysRemaining = tlsCheck.daysRemaining;
      results.https.error = tlsCheck.error || null;

      if (tlsCheck.active) {
        results.https.status = 'passed';
        results.https.guidance = `Valid TLS certificate issued by ${tlsCheck.issuer}. Expires in ${tlsCheck.daysRemaining} days.`;
      } else {
        results.https.status = 'failed';
        results.https.guidance = `TLS handshake failed: ${tlsCheck.error}. If certificate was recently issued, ensure port 443 is forwarded.`;
      }
    } catch (err) {
      results.https.status = 'failed';
      results.https.error = err.message;
    }
  }

  // Calculate overall health
  if (results.dns.status === 'passed' && (results.routing.status === 'passed' || results.routing.status === 'skipped')) {
    results.overallHealth = 'healthy';
  } else if (results.dns.status === 'failed' || results.routing.status === 'failed') {
    results.overallHealth = 'degraded';
  } else {
    results.overallHealth = 'pending';
  }

  // Update DB record
  db.prepare(`
    UPDATE subdomains
    SET dns_status = ?,
        proxy_status = CASE WHEN ? = 'passed' THEN 'active' WHEN ? = 'failed' THEN 'failed' ELSE proxy_status END,
        https_status = CASE WHEN ? = 'passed' THEN 'active' WHEN ? = 'failed' THEN 'error' ELSE https_status END,
        last_verified_at = datetime('now'),
        last_verification_results = ?
    WHERE id = ?
  `).run(
    results.dns.status === 'passed' ? 'propagated' : (results.dns.status === 'failed' ? 'failed' : sub.dns_status),
    results.routing.status, results.routing.status,
    results.https.status, results.https.status,
    JSON.stringify(results),
    subdomainId
  );

  return results;
}

/**
 * Regenerate and repair reverse proxy route
 */
async function repairSubdomainRoute(subdomainId, userTgId = null) {
  const sub = getSubdomainById(subdomainId);
  if (!sub) throw new Error(`Subdomain #${subdomainId} not found`);

  const preview = await previewSubdomainWizard({
    subdomain: sub.subdomain,
    baseDomain: sub.base_domain,
    destinationType: sub.destination_type,
    destinationTarget: sub.destination_target,
    nodeId: sub.node_id,
    applicationId: sub.application_id,
    enableDns: false,
    enableProxy: true,
    enableHttps: sub.https_status === 'active'
  });

  if (!preview.proxy.configPreview) {
    throw new Error('Cannot generate proxy configuration for this destination type.');
  }

  const applied = await applyRouteConfig({
    subdomainId,
    serverName: sub.full_domain,
    configContent: preview.proxy.configPreview,
    userTgId
  });

  const verification = await verifySubdomainRoute(subdomainId);

  return {
    success: true,
    message: 'Route regenerated and applied successfully',
    applied,
    verification
  };
}

/**
 * Safe Subdomain Removal with Separate Options for DNS, Proxy, and Data
 */
async function safeDeleteSubdomain(subdomainId, tgId, options = {}, isAdmin = false) {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subdomains WHERE id=?').get(subdomainId);
  if (!sub) throw new Error(`Subdomain #${subdomainId} not found`);
  if (sub.tg_id !== tgId && !isAdmin) throw new Error('Access denied');

  const { deleteDns = false, deleteSiteData = false } = options;

  // 1. Delete DNS Record if requested
  if (deleteDns && sub.dns_record_id && sub.domain_id) {
    try {
      const domain = db.prepare('SELECT * FROM custom_domains WHERE id=?').get(sub.domain_id);
      if (domain && domain.dns_provider !== 'manual') {
        const provider = getProvider(domain.dns_provider, domain.dns_provider_token);
        let zoneId = domain.dns_zone_id;
        if (!zoneId) {
          const zoneInfo = await provider.getZone(domain.domain);
          zoneId = zoneInfo.id;
        }
        await provider.deleteRecord(zoneId, sub.dns_record_id);
      }
    } catch (err) {
      logger.warn({ err: err.message, subdomainId }, 'Failed to delete remote DNS record on subdomain removal');
    }
  }

  // 2. Remove reverse proxy route
  try {
    await removeRouteConfig(sub.full_domain, tgId);
  } catch {}

  // 3. Delete database record
  db.prepare('DELETE FROM subdomains WHERE id=?').run(subdomainId);

  logChange({
    tgId,
    category: 'subdomains',
    action: 'subdomain_deleted',
    details: `Deleted subdomain "${sub.full_domain}" (deleteDns: ${Boolean(deleteDns)}, deleteSiteData: ${Boolean(deleteSiteData)})`,
    metadata: { subdomainId, fullDomain: sub.full_domain, options }
  }).catch(() => {});

  return {
    status: 'deleted',
    success: true,
    deletedId: subdomainId,
    fullDomain: sub.full_domain
  };
}

module.exports = {
  validateSubdomainSyntax,
  validateSubdomainStep,
  previewSubdomainWizard,
  deploySubdomainWizard,
  getSubdomainById,
  verifySubdomainRoute,
  repairSubdomainRoute,
  safeDeleteSubdomain
};
