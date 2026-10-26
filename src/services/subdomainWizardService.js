'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
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
const { assertSafeOutboundUrl } = require('../utils/ssrfGuard');
const appRunner = require('./appRunnerService');
const {
  assertBaseDomainAllowed,
  getPlatformBaseDomains,
  validateSubdomainName
} = require('./subdomainService');

const MAX_STATIC_BODY_BYTES = 256 * 1024;
const MAX_CONTENT_TYPE_LENGTH = 128;
const VALID_CONTENT_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*charset=[a-z0-9-]+)?$/i;
const DESTINATION_TYPE_ALIASES = new Map([
  ['proxy', 'external_url'],
  ['external', 'external_url'],
  ['external_url', 'external_url'],
  ['url', 'external_url'],
  ['internal_port', 'internal_service'],
  ['port', 'internal_service'],
  ['internal_service', 'internal_service'],
  ['node_app', 'node_app'],
  ['node', 'node_app'],
  ['static', 'static'],
  ['dns_only', 'dns_only'],
  ['dns', 'dns_only']
]);
const DESTINATION_TYPE_MESSAGE =
  'Destination type must be one of: external_url, internal_service, node_app, static, dns_only';

function validateSubdomainSyntax(subdomain, isAdmin = false) {
  // Keep the wizard consistent with the regular claim flow so reserved names
  // (api, www, mail, status, ...) cannot be bypassed through the wizard.
  return validateSubdomainName(subdomain, isAdmin);
}

function normalizeDestinationType(value) {
  const clean = String(value || 'internal_service').trim().toLowerCase();
  const canonical = DESTINATION_TYPE_ALIASES.get(clean);
  if (!canonical) {
    throw new Error(`Unsupported destination type '${value}'. ${DESTINATION_TYPE_MESSAGE}`);
  }
  return canonical;
}

function normalizeRecordType(value) {
  const clean = String(value || 'A').trim().toUpperCase();
  if (!['A', 'AAAA', 'CNAME'].includes(clean)) {
    throw new Error('DNS record type must be A, AAAA, or CNAME');
  }
  return clean;
}

function isValidHostname(value) {
  if (typeof value !== 'string') return false;
  const clean = value.trim().toLowerCase().replace(/\.$/, '');
  if (clean.length < 3 || clean.length > 253 || !clean.includes('.')) return false;
  return clean.split('.').every((label) =>
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
}

function resolveDnsContent({ recordType, dnsContent, fullDomain }) {
  const provided = typeof dnsContent === 'string' ? dnsContent.trim() : '';

  if (recordType === 'A') {
    if (provided) {
      if (!net.isIPv4(provided)) {
        throw new Error('A record content must be a valid IPv4 address. Use CNAME for hostnames.');
      }
      return provided;
    }
    const fallback = String(config.server?.publicIp || '').trim();
    if (!net.isIPv4(fallback)) {
      throw new Error('No server IPv4 address is available for the A record. Provide dns_content explicitly.');
    }
    return fallback;
  }

  if (recordType === 'AAAA') {
    if (provided) {
      if (!net.isIPv6(provided)) {
        throw new Error('AAAA record content must be a valid IPv6 address.');
      }
      return provided;
    }
    throw new Error('AAAA record content is required when the record type is AAAA.');
  }

  if (!provided) {
    throw new Error('CNAME content is required (for example origin.example.com).');
  }
  if (net.isIP(provided)) {
    throw new Error('CNAME content must be a valid hostname, not an IP address.');
  }
  if (!isValidHostname(provided)) {
    throw new Error('CNAME content must be a valid hostname, not an IP address.');
  }
  const normalized = provided.replace(/\.$/, '').toLowerCase();
  if (normalized === String(fullDomain).toLowerCase()) {
    throw new Error('CNAME content cannot point at the subdomain itself.');
  }
  return normalized;
}

function normalizeStaticBody(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new Error('Static response body must be a string');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_STATIC_BODY_BYTES) {
    throw new Error(`Static response body must not exceed ${Math.floor(MAX_STATIC_BODY_BYTES / 1024)} KB`);
  }
  return value;
}

function normalizeContentType(value) {
  const clean = String(value || 'text/html; charset=utf-8').trim();
  if (clean.length > MAX_CONTENT_TYPE_LENGTH || !VALID_CONTENT_TYPE.test(clean)) {
    throw new Error('Invalid static response content type');
  }
  return clean;
}

function normalizeNodeId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('node_id must be a positive integer');
  }
  return id;
}

function assertValidPort(port, label = 'Destination port') {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be between 1 and 65535`);
  }
  return port;
}

function formatHostPort(host, port) {
  const clean = String(host || '').trim().replace(/^\[|\]$/g, '');
  if (net.isIPv6(clean)) return `[${clean}]:${port}`;
  return `${clean}:${port}`;
}

function resolveInternalServiceTarget(value) {
  if (value === null || value === undefined || value === '') {
    return { host: '127.0.0.1', port: appRunner.DEFAULT_APP_PORT };
  }

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    return { host: '127.0.0.1', port: assertValidPort(Number.parseInt(raw, 10)) };
  }

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    throw new Error(`Internal service target must be a port number (for example ${appRunner.DEFAULT_APP_PORT}) or a loopback URL`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('Internal service destinations must target the local host (127.0.0.1)');
  }
  return { host: '127.0.0.1', port: assertValidPort(Number.parseInt(parsed.port, 10) || appRunner.DEFAULT_APP_PORT) };
}

function resolveTlsCertificatePaths(fullDomain) {
  const certRoot = String(config.tls?.certDir || '').trim();
  if (!certRoot) {
    return { available: false, certPath: null, keyPath: null };
  }
  const certPath = path.join(certRoot, fullDomain, 'fullchain.pem');
  const keyPath = path.join(certRoot, fullDomain, 'privkey.pem');
  let available = false;
  try {
    available = fs.existsSync(certPath) && fs.existsSync(keyPath);
  } catch {
    available = false;
  }
  return { available, certPath, keyPath };
}

/**
 * Step 2: Validate subdomain name and detect conflicts
 */
function validateSubdomainStep({ subdomain, baseDomain, tgId = null, isAdmin = false }) {
  const cleanSub = validateSubdomainSyntax(subdomain, isAdmin);
  const cleanBase = resolveBaseDomain({ baseDomain, tgId, isAdmin });
  const fullDomain = `${cleanSub}.${cleanBase}`;

  // Check if exists in subdomains table
  assertHostnameAvailable(fullDomain);

  return {
    valid: true,
    subdomain: cleanSub,
    baseDomain: cleanBase,
    fullDomain
  };
}

function resolveBaseDomain({ baseDomain, tgId = null, isAdmin = false }) {
  if (tgId) {
    return assertBaseDomainAllowed(tgId, baseDomain, isAdmin);
  }
  const clean = String(baseDomain || config.domains?.defaultDomain || getPlatformBaseDomains()[0] || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!clean) {
    throw new Error('A base domain is required. Configure DOMAINS or pass baseDomain explicitly.');
  }
  return clean;
}

function normalizeApplicationId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('application_id must be a positive integer');
  return id;
}

function assertApplicationAccess(applicationId, tgId, isAdmin) {
  const id = normalizeApplicationId(applicationId);
  if (!id) return null;
  const app = getDb().prepare('SELECT id, name, user_tg_id FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!isAdmin && tgId && app.user_tg_id !== null && app.user_tg_id !== undefined &&
      String(app.user_tg_id) !== String(tgId)) {
    throw new Error(`Unauthorized: You do not have access to application #${id}`);
  }
  return app;
}

function assertHostnameAvailable(fullDomain) {
  const db = getDb();
  const existingSub = db.prepare('SELECT id FROM subdomains WHERE full_domain=? COLLATE NOCASE').get(fullDomain);
  if (existingSub) {
    throw new Error(`Hostname "${fullDomain}" is already in use by another routing service.`);
  }
  const existingSite = db.prepare('SELECT id FROM hosting_sites WHERE full_domain=? COLLATE NOCASE').get(fullDomain);
  if (existingSite) {
    throw new Error(`Hostname "${fullDomain}" is already in use by an active website deployment.`);
  }
}

/**
 * Preview Planned Changes (Steps 4 - 7)
 */
async function previewSubdomainWizard({
  subdomain,
  baseDomain,
  destinationType = 'internal_service',
  destinationTarget = null,
  dnsContent = null,
  nodeId = null,
  applicationId = null,
  enableDns = true,
  recordType = 'A',
  enableProxy = true,
  enableHttps = false,
  enableWebsocket = true,
  securityHeaders = false,
  forceHttpsRedirect = false,
  webCustomBody = null,
  webCustomContentType = null,
  tgId = null,
  isAdmin = false,
  allowExistingHostname = false
}) {
  const cleanType = normalizeDestinationType(destinationType);
  const cleanRecordType = normalizeRecordType(recordType);
  const cleanSub = validateSubdomainSyntax(subdomain, isAdmin);
  const cleanBase = resolveBaseDomain({ baseDomain, tgId, isAdmin });
  const fullDomain = `${cleanSub}.${cleanBase}`;
  const linkedApplication = assertApplicationAccess(applicationId, tgId, isAdmin);

  if (!allowExistingHostname) {
    assertHostnameAvailable(fullDomain);
  }

  const db = getDb();
  const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain=? COLLATE NOCASE').get(cleanBase);

  // 1. Resolve destination target
  let targetHost = '127.0.0.1';
  let targetPort = appRunner.DEFAULT_APP_PORT;
  let resolvedTarget = null;
  let webMode = 'proxy';
  let webTarget = null;
  let staticBody = null;
  let resolvedNodeId = null;

  if (cleanType === 'node_app') {
    if (!isAdmin) {
      throw new Error('Only administrators can route subdomains to cluster nodes');
    }
    resolvedNodeId = normalizeNodeId(nodeId);
    if (!resolvedNodeId) {
      throw new Error('node_id is required for node-backed destinations');
    }
    const node = db.prepare('SELECT id, host, port, http_port FROM hosting_nodes WHERE id=?').get(resolvedNodeId);
    if (!node) throw new Error(`Node #${resolvedNodeId} not found`);
    if (!node.host) throw new Error(`Node #${resolvedNodeId} has no host configured`);

    targetHost = node.host;
    targetPort = assertValidPort(
      Number.parseInt(destinationTarget, 10) || Number.parseInt(node.http_port, 10) || Number.parseInt(node.port, 10) || 80
    );
    resolvedTarget = formatHostPort(targetHost, targetPort);
    webTarget = `http://${resolvedTarget}`;
  } else if (cleanType === 'internal_service') {
    const internal = resolveInternalServiceTarget(destinationTarget);
    targetHost = internal.host;
    targetPort = internal.port;
    resolvedTarget = formatHostPort(targetHost, targetPort);
    webTarget = `http://${resolvedTarget}`;
  } else if (cleanType === 'external_url') {
    if (!destinationTarget || typeof destinationTarget !== 'string' || !/^https?:\/\//i.test(destinationTarget.trim())) {
      throw new Error('External URL must start with http:// or https://');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(destinationTarget.trim());
    } catch {
      throw new Error('External URL is not a valid absolute URL');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('External URL must use http:// or https://');
    }
    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('External URL must not contain embedded credentials');
    }
    if (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
      throw new Error('External URL must contain only the scheme, host, and optional port (no path, query, or fragment)');
    }
    try {
      await assertSafeOutboundUrl(parsedUrl.origin, { label: 'External URL' });
    } catch (err) {
      if (/private or loopback|blocked host/i.test(err.message)) {
        throw new Error(`${err.message}. Use the internal service destination for local targets.`);
      }
      throw err;
    }

    targetHost = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    targetPort = assertValidPort(Number.parseInt(parsedUrl.port, 10) || (parsedUrl.protocol === 'https:' ? 443 : 80));
    resolvedTarget = parsedUrl.origin;
    webTarget = resolvedTarget;
  } else if (cleanType === 'static') {
    targetHost = '127.0.0.1';
    targetPort = assertValidPort(Number.parseInt(config.server?.port, 10) || 3000, 'Application port');
    resolvedTarget = formatHostPort(targetHost, targetPort);
    staticBody = normalizeStaticBody(webCustomBody);
    if (!staticBody.trim()) {
      throw new Error('Static response body is required for static destinations');
    }
    webMode = 'static';
  } else if (cleanType === 'dns_only') {
    webMode = 'landing';
  }

  // 2. Formulate proposed DNS changes
  const dnsValue = resolveDnsContent({
    recordType: cleanRecordType,
    dnsContent,
    fullDomain
  });

  if (cleanType === 'dns_only') {
    resolvedTarget = dnsValue;
  }

  const proposedDns = {
    action: enableDns ? 'create' : 'none',
    provider: domainRecord?.dns_provider || 'manual',
    recordType: cleanRecordType,
    hostname: fullDomain,
    content: dnsValue,
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

  // 3. Formulate proposed proxy route
  const tlsPaths = resolveTlsCertificatePaths(fullDomain);
  const httpsRequested = Boolean(enableHttps);
  const httpsEnabled = httpsRequested && tlsPaths.available;
  const routeEnabled = cleanType !== 'dns_only' && (cleanType === 'static' || Boolean(enableProxy));

  let proposedProxy = null;
  if (routeEnabled) {
    proposedProxy = generateNginxVhost({
      serverName: fullDomain,
      destinationType: cleanType,
      targetHost,
      targetPort,
      upstreamUrl: cleanType === 'external_url' ? resolvedTarget : null,
      enableSsl: httpsEnabled,
      sslCertPath: tlsPaths.certPath,
      sslKeyPath: tlsPaths.keyPath,
      enableWebsocket: Boolean(enableWebsocket),
      securityHeaders: Boolean(securityHeaders),
      forceHttpsRedirect: httpsEnabled && Boolean(forceHttpsRedirect)
    });
  }

  return {
    fullDomain,
    subdomain: cleanSub,
    baseDomain: cleanBase,
    destination: {
      type: cleanType,
      target: resolvedTarget,
      nodeId: resolvedNodeId,
      applicationId: linkedApplication?.id || null
    },
    dns: proposedDns,
    proxy: {
      enabled: routeEnabled,
      upstreamName: proposedProxy?.upstreamName || null,
      proxyPassTarget: proposedProxy?.proxyPassTarget || null,
      configPreview: proposedProxy?.config || null,
      websocket: Boolean(enableWebsocket),
      securityHeaders: Boolean(securityHeaders)
    },
    https: {
      requested: httpsRequested,
      enabled: httpsEnabled,
      mode: httpsEnabled ? 'certificate_ready' : (httpsRequested ? 'pending_certificate' : 'disabled'),
      certificateAvailable: tlsPaths.available,
      certificatePath: tlsPaths.available ? tlsPaths.certPath : null,
      warning: httpsRequested && !tlsPaths.available
        ? `No TLS certificate was found at ${tlsPaths.certPath}. The HTTP route will still be created; provision the certificate and repair the route to enable HTTPS.`
        : null
    },
    web: {
      enabled: cleanType !== 'dns_only' && routeEnabled,
      mode: webMode,
      target: webTarget,
      customBody: staticBody,
      customContentType: cleanType === 'static'
        ? normalizeContentType(webCustomContentType)
        : 'text/html; charset=utf-8'
    },
    conflictWarning: proposedDns.hasConflict ? proposedDns.conflicts.join(' ') : null
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
  dnsContent = null,
  nodeId = null,
  applicationId = null,
  enableDns = true,
  recordType = 'A',
  enableProxy = true,
  enableHttps = false,
  enableWebsocket = true,
  securityHeaders = false,
  forceHttpsRedirect = false,
  webCustomBody = null,
  webCustomContentType = null,
  emailCatchAll = true,
  confirmationAccepted = false,
  isAdmin = false
}) {
  if (!confirmationAccepted) {
    throw new Error('You must review and explicitly confirm the deployment of planned routing changes.');
  }

  const preview = await previewSubdomainWizard({
    subdomain,
    baseDomain,
    destinationType,
    destinationTarget,
    dnsContent,
    nodeId,
    applicationId,
    enableDns,
    recordType,
    enableProxy,
    enableHttps,
    enableWebsocket,
    securityHeaders,
    forceHttpsRedirect,
    webCustomBody,
    webCustomContentType,
    tgId,
    isAdmin
  });

  if (preview.dns.hasConflict) {
    throw new Error(`DNS Conflict detected: ${preview.dns.conflicts.join(' ')}`);
  }

  const db = getDb();
  const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain=? COLLATE NOCASE').get(preview.baseDomain);

  let dnsRecordId = null;
  let dnsStatus = 'pending';
  let dnsZoneId = null;

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
      dnsZoneId = zoneId;

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
  if (preview.proxy.enabled && preview.proxy.configPreview) {
    try {
      const applied = await applyRouteConfig({
        subdomainId: null,
        serverName: preview.fullDomain,
        configContent: preview.proxy.configPreview,
        userTgId: tgId
      });
      proxyStatus = applied.pending ? 'pending' : 'active';
      routeConfigPath = applied.filePath;
    } catch (err) {
      proxyStatus = 'failed';
      logger.error({ err: err.message, domain: preview.fullDomain }, 'Proxy route generation failed');
    }
  }

  // 3. Persist in database. If this fails, roll back the external side effects
  // (Nginx route and DNS record) so a retry starts from a clean state.
  let subdomainId;
  try {
    const info = db.prepare(`
      INSERT INTO subdomains (
        tg_id, domain_id, node_id, application_id,
        subdomain, full_domain, base_domain, active,
        email_catch_all,
        web_enabled, web_mode, web_target, web_custom_body, web_custom_content_type,
        destination_type, destination_target,
        dns_record_type, dns_record_value, dns_record_id, dns_status,
        proxy_status, proxy_config_path, https_status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      tgId,
      domainRecord?.id || null,
      preview.destination.nodeId || null,
      preview.destination.applicationId || null,
      preview.subdomain,
      preview.fullDomain,
      preview.baseDomain,
      emailCatchAll ? 1 : 0,
      preview.web.enabled ? 1 : 0,
      preview.web.mode,
      preview.web.target,
      preview.web.customBody,
      preview.web.customContentType,
      preview.destination.type,
      preview.destination.target,
      preview.dns.recordType,
      preview.dns.content,
      dnsRecordId,
      dnsStatus,
      proxyStatus,
      routeConfigPath,
      preview.https.enabled ? 'active' : (preview.https.requested ? 'pending' : 'disabled')
    );
    subdomainId = info.lastInsertRowid;
  } catch (err) {
    if (routeConfigPath) {
      try {
        await removeRouteConfig(preview.fullDomain, tgId);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr.message, domain: preview.fullDomain }, 'Failed to roll back proxy route after database error');
      }
    }
    if (dnsRecordId && dnsZoneId && domainRecord) {
      try {
        const provider = getProvider(domainRecord.dns_provider, domainRecord.dns_provider_token);
        await provider.deleteRecord(dnsZoneId, dnsRecordId);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr.message, domain: preview.fullDomain }, 'Failed to roll back DNS record after database error');
      }
    }
    throw err;
  }

  // Link route to subdomainId (pending routes are linked as well so a later
  // Nginx reload/provider can activate them without losing ownership).
  if (proxyStatus === 'active' || proxyStatus === 'pending') {
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
  let verification = null;
  if (sub.last_verification_results) {
    try { verification = JSON.parse(sub.last_verification_results); } catch { verification = null; }
  }
  return {
    ...sub,
    last_verification_results: verification
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

  // 1. Check DNS resolution. A deployment that deliberately skipped DNS
  // creation should not be reported as broken; the user may manage the record
  // elsewhere or not need one yet.
  if (sub.dns_status === 'none') {
    results.dns.status = 'skipped';
    results.dns.guidance = 'DNS record creation was disabled for this deployment.';
  } else {
    try {
      const dnsCheck = await checkDnsPropagation(sub.full_domain, sub.dns_record_type || 'A', sub.dns_record_value);
      results.dns.resolved = dnsCheck.resolved;
      results.dns.values = dnsCheck.values;
      results.dns.error = dnsCheck.error;

      if (dnsCheck.resolved && (!sub.dns_record_value || dnsCheck.matchesExpected)) {
        results.dns.status = 'passed';
        results.dns.guidance = 'DNS record resolves correctly.';
      } else if (dnsCheck.resolved) {
        results.dns.status = 'failed';
        results.dns.guidance = `DNS for ${sub.full_domain} resolves to ${dnsCheck.values.join(', ')}, but the configured ${sub.dns_record_type || 'A'} value is ${sub.dns_record_value}. Update the record or press Repair after changing DNS.`;
      } else {
        results.dns.status = 'failed';
        results.dns.guidance = `DNS record for ${sub.full_domain} not yet resolving (${dnsCheck.error || 'NXDOMAIN'}). Please allow a few minutes for propagation or verify your authoritative DNS settings.`;
      }
    } catch (err) {
      results.dns.status = 'failed';
      results.dns.error = err.message;
      results.dns.guidance = 'Failed to execute DNS query.';
    }
  }

  // 2. Check Routing Reachability
  if (sub.destination_type === 'dns_only') {
    results.routing.status = 'skipped';
    results.routing.guidance = 'DNS-only mode: HTTP reverse proxy routing is disabled.';
  } else if (sub.destination_type === 'static') {
    results.routing.status = 'skipped';
    results.routing.guidance = 'Static responses are served by the Commandor edge router; the upstream HTTP probe is not required.';
  } else if (sub.destination_target) {
    try {
      let testTarget = sub.destination_target;
      if (!/^https?:\/\//i.test(testTarget)) {
        testTarget = `http://${testTarget}`;
      }
      const parsedUrl = new URL(testTarget);
      // Node hosts are trusted administrator-managed infrastructure, so they
      // may live on a private network. User-supplied external URLs must not
      // reach link-local metadata services.
      const safety = await assertSafeOutboundUrl(testTarget, {
        allowLoopback: true,
        allowPrivate: sub.destination_type === 'node_app' ? true : undefined,
        label: 'Destination target'
      });
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const pinnedAddress = safety.addresses[0];

      const reqPromise = new Promise((resolve) => {
        const requestOptions = { timeout: 5000 };
        if (pinnedAddress) {
          requestOptions.lookup = (_hostname, _options, callback) => {
            callback(null, pinnedAddress.address, pinnedAddress.family);
          };
        }
        const testReq = client.get(testTarget, requestOptions, (res) => {
          res.resume();
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
      results.routing.guidance = `Routing verification was blocked for safety: ${err.message}`;
    }
  } else {
    results.routing.status = 'skipped';
    results.routing.guidance = 'No upstream destination is configured for this subdomain.';
  }

  // 3. Check HTTPS / TLS. A pending certificate is a normal intermediate
  // state, not a failed deployment, so report it separately from a broken
  // handshake.
  const httpsRequired = Boolean(sub.https_status && sub.https_status !== 'disabled');
  const certPaths = resolveTlsCertificatePaths(sub.full_domain);
  if (sub.https_status === 'pending' && !certPaths.available) {
    results.https.status = 'pending';
    results.https.guidance = `HTTPS was requested, but no certificate exists at ${certPaths.certPath}. The HTTP route remains active; provision the certificate and use Repair Route to enable TLS.`;
  } else if (httpsRequired) {
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
        results.https.guidance = `TLS handshake failed: ${tlsCheck.error || 'no certificate presented'}. If a certificate was recently provisioned, ensure port 443 is forwarded and repair the route.`;
      }
    } catch (err) {
      results.https.status = 'failed';
      results.https.error = err.message;
      results.https.guidance = `TLS verification failed: ${err.message}`;
    }
  }

  // Calculate overall health. DNS may be skipped only for non-DNS-only routes
  // where the operator chose not to create a record.
  const dnsOk = results.dns.status === 'passed' ||
    (results.dns.status === 'skipped' && sub.destination_type !== 'dns_only');
  const routingOk = results.routing.status === 'passed' || results.routing.status === 'skipped';
  if (dnsOk && routingOk && (!httpsRequired || results.https.status === 'passed')) {
    results.overallHealth = 'healthy';
  } else if (
    results.dns.status === 'failed' ||
    results.routing.status === 'failed' ||
    (httpsRequired && results.https.status === 'failed')
  ) {
    results.overallHealth = 'degraded';
  } else {
    results.overallHealth = 'pending';
  }

  const remediation = [];
  if (results.dns.status === 'failed' && results.dns.guidance) remediation.push(results.dns.guidance);
  if (results.routing.status === 'failed' && results.routing.guidance) remediation.push(results.routing.guidance);
  if (httpsRequired && ['failed', 'pending'].includes(results.https.status) && results.https.guidance) {
    remediation.push(results.https.guidance);
  }
  if (remediation.length) {
    results.remediation = Array.from(new Set(remediation)).join(' ');
  }

  // Update DB record
  db.prepare(`
    UPDATE subdomains
    SET dns_status = ?,
        https_status = CASE WHEN ? = 'passed' THEN 'active' WHEN ? = 'failed' THEN 'error' ELSE https_status END,
        last_verified_at = datetime('now'),
        last_verification_results = ?
    WHERE id = ?
  `).run(
    results.dns.status === 'passed' ? 'propagated' : (results.dns.status === 'failed' ? 'failed' : sub.dns_status),
    results.https.status, results.https.status,
    JSON.stringify(results),
    subdomainId
  );

  return results;
}

/**
 * Regenerate and repair reverse proxy route
 */
async function repairSubdomainRoute(subdomainId, userTgId = null, isAdmin = false) {
  const sub = getSubdomainById(subdomainId);
  if (!sub) throw new Error(`Subdomain #${subdomainId} not found`);

  const preview = await previewSubdomainWizard({
    subdomain: sub.subdomain,
    baseDomain: sub.base_domain,
    destinationType: sub.destination_type,
    destinationTarget: sub.destination_target,
    dnsContent: sub.dns_record_value,
    nodeId: sub.node_id,
    applicationId: sub.application_id,
    enableDns: false,
    enableProxy: true,
    enableHttps: sub.https_status !== 'disabled',
    webCustomBody: sub.web_custom_body,
    webCustomContentType: sub.web_custom_content_type,
    tgId: userTgId,
    isAdmin,
    allowExistingHostname: true
  });

  if (!preview.proxy.enabled) {
    const verification = await verifySubdomainRoute(subdomainId);
    return {
      success: true,
      skipped: true,
      pending: false,
      message: 'This subdomain uses DNS-only routing and has no reverse proxy route to repair.',
      applied: null,
      verification
    };
  }

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
    pending: Boolean(applied.pending),
    message: applied.pending
      ? `Route regenerated and stored (pending: ${applied.pendingReason || 'Nginx not reloaded'})`
      : 'Route regenerated and applied successfully',
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
  if (String(sub.tg_id) !== String(tgId) && !isAdmin) throw new Error('Access denied');

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

  // 3. Delete associated site data when requested. Web requests are always
  // removed with the subdomain row (foreign-key cascade); aliases are kept
  // unless the caller explicitly asks to delete site data.
  let deletedAliases = 0;
  if (deleteSiteData) {
    try {
      deletedAliases = db.prepare('DELETE FROM aliases WHERE domain=? COLLATE NOCASE AND tg_id=?')
        .run(sub.full_domain, sub.tg_id).changes;
    } catch (err) {
      logger.warn({ err: err.message, subdomainId }, 'Failed to delete aliases for subdomain');
    }
    try {
      db.prepare('DELETE FROM subdomain_web_requests WHERE subdomain_id=?').run(subdomainId);
    } catch {}
  }

  // 4. Delete database record
  db.prepare('DELETE FROM subdomains WHERE id=?').run(subdomainId);

  logChange({
    tgId,
    category: 'subdomains',
    action: 'subdomain_deleted',
    details: `Deleted subdomain "${sub.full_domain}" (deleteDns: ${Boolean(deleteDns)}, deleteSiteData: ${Boolean(deleteSiteData)})`,
    metadata: { subdomainId, fullDomain: sub.full_domain, options, deletedAliases }
  }).catch(() => {});

  return {
    status: 'deleted',
    success: true,
    deletedId: subdomainId,
    fullDomain: sub.full_domain,
    deletedAliases
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
