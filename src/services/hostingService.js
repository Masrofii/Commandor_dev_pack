'use strict';
const AdmZip = require('adm-zip');
const { getDb } = require('../../database/database');
const { scanFiles, logSecurityViolation } = require('./fileScannerService');
const { getAvailableNode, getNodeById, deployFilesToNode, removeSiteFromNode } = require('./nodeManagerService');
const { claimSubdomain, updateSubdomain, deleteSubdomain, getSubdomainByFullDomain, getPlatformBaseDomains } = require('./subdomainService');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');
const { checkHostingStorageQuota } = require('./quotaService');

const HOSTING_TOS = `
Commandor Cloud Hosting - Terms of Service & Acceptable Use Policy:
1. Strict Zero-Tolerance Anti-Abuse:
   - NO Cryptocurrency miners (e.g. XMRig, Stratum, CoinHive).
   - NO Phishing templates, fake login kits (PayPal, Steam, Discord, Crypto wallets).
   - NO Webshells, backdoors, reverse shells, or remote exploit scripts.
   - NO Denial of Service (DDoS) tools, flooders, port scanners.
   - NO Bulk mailers, spam dispatchers, or unauthorized proxies.
2. Automated Security Scanning:
   - All uploaded files and contents are automatically scanned prior to deployment.
   - Any malicious content is blocked, logged, and will lead to an immediate ban.
3. Resource Fair Use:
   - You must adhere to the storage and bandwidth limits of your assigned plan.
`;

function getTOS() {
  return {
    version: '1.0',
    title: 'Terms of Service & Acceptable Use Policy',
    content: HOSTING_TOS.trim()
  };
}

function getPlan(planId) {
  const db = getDb();
  return db.prepare('SELECT * FROM hosting_plans WHERE id=?').get(planId) || db.prepare('SELECT * FROM hosting_plans WHERE is_default=1').get();
}

function getUserSites(tgId, isAdmin = false) {
  const db = getDb();
  const sites = db.prepare(`
    SELECT s.*, n.name as node_name, n.status as node_status
    FROM hosting_sites s
    LEFT JOIN hosting_nodes n ON s.node_id = n.id
    WHERE s.tg_id = ?
    ORDER BY s.created_at DESC
  `).all(tgId);

  if (!isAdmin) {
    for (const s of sites) {
      delete s.node_name;
      delete s.node_id;
      delete s.node_status;
    }
  }

  return sites;
}

function getSiteById(id, tgId = null, isAdmin = false) {
  const db = getDb();
  let q = `
    SELECT s.*, n.name as node_name, n.public_url as node_public_url, n.status as node_status
    FROM hosting_sites s
    LEFT JOIN hosting_nodes n ON s.node_id = n.id
    WHERE s.id = ?
  `;
  const params = [id];
  if (tgId !== null && !isAdmin) {
    q += ' AND s.tg_id = ?';
    params.push(tgId);
  }
  const site = db.prepare(q).get(...params);
  if (site && !isAdmin) {
    delete site.node_name;
    delete site.node_id;
    delete site.node_status;
    delete site.node_public_url;
  }
  return site;
}

function checkUserLimits(tgId, planId = 'free') {
  const db = getDb();
  const user = db.prepare('SELECT role FROM users WHERE tg_id=?').get(tgId);
  const isAdmin = (user?.role === 'admin') || (config.telegram?.adminId && (String(tgId) === String(config.telegram.adminId)));

  if (isAdmin) {
    return { plan: getPlan('unlimited'), currentSites: 0, canCreate: true };
  }

  const plan = getPlan(planId);
  const currentSites = db.prepare('SELECT COUNT(*) as count FROM hosting_sites WHERE tg_id=?').get(tgId).count;

  return {
    plan,
    currentSites,
    canCreate: currentSites < plan.max_sites,
    remaining: Math.max(0, plan.max_sites - currentSites)
  };
}

async function deploySite({
  tgId,
  name,
  siteType = 'static',
  files = [],
  zipBuffer = null,
  rawHtml = null,
  planId = 'free',
  tosAccepted = true,
  ipAddress = null
}) {
  if (!tosAccepted) {
    throw new Error('You must accept the Hosting Terms of Service (Anti-Abuse Agreement) before deploying.');
  }

  if (!name || typeof name !== 'string') {
    throw new Error('Site name is required');
  }

  const cleanName = name.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  if (cleanName.length < 3 || cleanName.length > 30) {
    throw new Error('Site name must be between 3 and 30 characters (letters, numbers, hyphens).');
  }

  const db = getDb();
  const userLimits = checkUserLimits(tgId, planId);
  const existingSite = db.prepare('SELECT id, tg_id, node_id FROM hosting_sites WHERE name=? COLLATE NOCASE').get(cleanName);

  if (existingSite && existingSite.tg_id !== tgId) {
    throw new Error(`Site name '${cleanName}' is already taken by another user.`);
  }

  if (!existingSite && !userLimits.canCreate) {
    throw new Error(`Plan limit reached! Your '${userLimits.plan.name}' allows up to ${userLimits.plan.max_sites} site(s).`);
  }

  // 1. Prepare files array
  let filesToScan = [];

  if (zipBuffer && Buffer.isBuffer(zipBuffer)) {
    try {
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        if (entry.entryName.startsWith('__MACOSX/') || entry.entryName.endsWith('.DS_Store')) continue;
        filesToScan.push({
          name: entry.entryName,
          content: entry.getData()
        });
      }
    } catch (e) {
      throw new Error(`Could not read ZIP archive: ${e.message}`);
    }
  } else if (rawHtml && typeof rawHtml === 'string') {
    filesToScan.push({
      name: 'index.html',
      content: rawHtml
    });
  } else if (Array.isArray(files) && files.length > 0) {
    filesToScan = files.map(f => ({
      name: f.name || f.path || 'index.html',
      content: f.content || ''
    }));
  }

  if (filesToScan.length === 0) {
    throw new Error('No valid files provided for deployment.');
  }

  // Ensure index.html exists
  const hasIndex = filesToScan.some(f => f.name.toLowerCase() === 'index.html' || f.name.toLowerCase() === 'index.htm');
  if (!hasIndex && siteType === 'static') {
    throw new Error("Missing 'index.html'! Static sites must contain an index.html file.");
  }

  // 2. Strict Security Scanner (Anti-Malware, Anti-Phishing, Anti-Miner)
  const scanResult = scanFiles(filesToScan);
  if (!scanResult.safe) {
    const firstViolation = scanResult.violations[0];
    logSecurityViolation(tgId, {
      siteId: existingSite?.id || null,
      threatType: firstViolation.threat,
      fileName: firstViolation.file,
      matchedPattern: firstViolation.pattern,
      ipAddress
    });

    throw new Error(`Security Violation Blocked! File '${firstViolation.file}' flagged: ${firstViolation.name}. Malicious or disallowed content is strictly forbidden.`);
  }

  // 3. Quota & Limits Verification
  let totalBytes = 0;
  for (const f of filesToScan) {
    const len = Buffer.isBuffer(f.content) ? f.content.length : Buffer.byteLength(String(f.content || ''));
    totalBytes += len;
  }

  if (filesToScan.length > userLimits.plan.max_files) {
    throw new Error(`Too many files! Your plan limit is ${userLimits.plan.max_files} files (uploaded: ${filesToScan.length}).`);
  }

  if (totalBytes > userLimits.plan.max_storage_bytes) {
    const maxMb = Math.round(userLimits.plan.max_storage_bytes / (1024 * 1024));
    const usedMb = (totalBytes / (1024 * 1024)).toFixed(1);
    throw new Error(`Storage limit exceeded! Allowed: ${maxMb}MB, uploaded: ${usedMb}MB.`);
  }

  // Enforce cumulative user hosting storage quota server-side
  checkHostingStorageQuota(tgId, totalBytes, existingSite ? existingSite.id : null);

  // 4. Select Node
  let node = null;
  if (existingSite) {
    node = getNodeById(existingSite.node_id);
  }
  if (!node || node.status !== 'online') {
    node = getAvailableNode();
  }
  if (!node) {
    throw new Error('No hosting servers currently available. Please contact support or administrator.');
  }

  // 5. Deploy files to remote node via SSH
  logger.info({ site: cleanName, node: node.name, files: filesToScan.length }, 'Deploying site files to node');
  const deployResult = await deployFilesToNode(node, cleanName, filesToScan);

  // 6. Subdomain Routing Gateway Integration
  const platformDomains = getPlatformBaseDomains();
  if (!platformDomains.length) {
    throw new Error('No base domain is configured. Set DOMAINS (or DEFAULT_DOMAIN) before deploying hosted sites.');
  }
  const baseDomain = config.domains?.defaultDomain || platformDomains[0];
  const fullDomain = `${cleanName}.${baseDomain}`.toLowerCase();
  const upstreamProxyUrl = `${node.public_url}/sites/${cleanName}/`;

  let subRecord = getSubdomainByFullDomain(fullDomain);
  if (!subRecord) {
    try {
      subRecord = claimSubdomain({
        tgId,
        subdomain: cleanName,
        baseDomain,
        emailCatchAll: 0,
        webEnabled: 1,
        webMode: 'proxy',
        webTarget: upstreamProxyUrl
      });
    } catch (e) {
      // Subdomain might already exist for this user
      logger.info({ domain: fullDomain, err: e.message }, 'Notice when auto-claiming subdomain for site');
    }
  } else {
    updateSubdomain(subRecord.id, tgId, {
      web_mode: 'proxy',
      web_target: upstreamProxyUrl,
      web_enabled: 1
    });
  }

  // 7. Save / Update in DB
  let siteId;
  if (existingSite) {
    db.prepare(`
      UPDATE hosting_sites
      SET node_id = ?, storage_used_bytes = ?, files_count = ?, status = 'active',
          last_deployed_at = datetime('now')
      WHERE id = ?
    `).run(node.id, deployResult.totalBytes, deployResult.filesCount, existingSite.id);
    siteId = existingSite.id;
  } else {
    const info = db.prepare(`
      INSERT INTO hosting_sites (
        tg_id, node_id, name, subdomain, full_domain, site_type, plan_id,
        remote_path, status, storage_used_bytes, files_count, visits_count,
        tos_accepted, tos_accepted_at, created_at, last_deployed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, 'active', ?, ?, 0,
        1, datetime('now'), datetime('now'), datetime('now')
      )
    `).run(
      tgId,
      node.id,
      cleanName,
      cleanName,
      fullDomain,
      siteType,
      planId,
      deployResult.siteDir,
      deployResult.totalBytes,
      deployResult.filesCount
    );
    siteId = info.lastInsertRowid;
    db.prepare('UPDATE hosting_nodes SET current_sites = current_sites + 1 WHERE id=?').run(node.id);
  }

  // Recalculate user hosting storage
  db.prepare(`
    UPDATE users 
    SET hosting_storage_used = (SELECT COALESCE(SUM(storage_used_bytes), 0) FROM hosting_sites WHERE tg_id = ?),
        storage_used = email_storage_used + (SELECT COALESCE(SUM(storage_used_bytes), 0) FROM hosting_sites WHERE tg_id = ?)
    WHERE tg_id = ?
  `).run(tgId, tgId, tgId);

  logger.info({ siteId, cleanName, fullDomain, nodeId: node.id }, 'Site successfully deployed and routing configured');
  logChange({
    tgId,
    category: 'hosting',
    action: 'site_deployed',
    details: `Deployed site "${cleanName}" (${fullDomain}) on node #${node.id}`,
    metadata: { siteId, name: cleanName, fullDomain, nodeId: node.id }
  }).catch(() => {});
  return getSiteById(siteId);
}

async function deleteSite(id, tgId = null, isAdmin = false) {
  const db = getDb();
  // Use the admin projection internally so node identifiers are available for
  // cleanup, then enforce ownership explicitly for non-admin callers.
  const site = getSiteById(id, null, true);
  if (!site) return false;
  if (!isAdmin && (site.tg_id === null || site.tg_id === undefined || String(site.tg_id) !== String(tgId))) {
    return false;
  }

  const node = getNodeById(site.node_id);
  if (node) {
    await removeSiteFromNode(node, site.name);
    db.prepare('UPDATE hosting_nodes SET current_sites = MAX(0, current_sites - 1) WHERE id=?').run(node.id);
  }

  // Release subdomain
  const subRecord = getSubdomainByFullDomain(site.full_domain);
  if (subRecord && (isAdmin || subRecord.tg_id === tgId)) {
    try {
      deleteSubdomain(subRecord.id, subRecord.tg_id);
    } catch {}
  }

  db.prepare('DELETE FROM hosting_sites WHERE id=?').run(id);

  // Recalculate user hosting storage
  if (site.tg_id) {
    db.prepare(`
      UPDATE users 
      SET hosting_storage_used = (SELECT COALESCE(SUM(storage_used_bytes), 0) FROM hosting_sites WHERE tg_id = ?),
          storage_used = email_storage_used + (SELECT COALESCE(SUM(storage_used_bytes), 0) FROM hosting_sites WHERE tg_id = ?)
      WHERE tg_id = ?
    `).run(site.tg_id, site.tg_id, site.tg_id);
  }

  logger.info({ id, siteName: site.name, tgId: site.tg_id }, 'Site deleted');
  logChange({
    tgId: site.tg_id,
    category: 'hosting',
    action: 'site_deleted',
    details: `Deleted site "${site.name}" (${site.full_domain})`,
    metadata: { id, name: site.name, fullDomain: site.full_domain }
  }).catch(() => {});
  return true;
}

function recordSiteVisit(fullDomain) {
  if (!fullDomain) return;
  const db = getDb();
  db.prepare('UPDATE hosting_sites SET visits_count = visits_count + 1 WHERE full_domain=? COLLATE NOCASE').run(fullDomain.toLowerCase().trim());
}

function getAllSitesAdmin(opts = {}) {
  const db = getDb();
  const { page = 1, limit = 50, search = null } = opts;
  const offset = (page - 1) * limit;

  let q = `
    SELECT s.*, u.username, n.name as node_name, n.host as node_host
    FROM hosting_sites s
    LEFT JOIN users u ON s.tg_id = u.tg_id
    LEFT JOIN hosting_nodes n ON s.node_id = n.id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    q += ' AND (s.name LIKE ? OR s.full_domain LIKE ? OR u.username LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  q += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const sites = db.prepare(q).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM hosting_sites').get().count;

  return { sites, total, page, limit };
}

function getSecurityLogs(opts = {}) {
  const db = getDb();
  const { page = 1, limit = 50, tgId = null } = opts;
  const offset = (page - 1) * limit;

  let q = 'SELECT l.*, u.username FROM hosting_security_logs l LEFT JOIN users u ON l.tg_id = u.tg_id WHERE 1=1';
  const params = [];

  if (tgId) {
    q += ' AND l.tg_id = ?';
    params.push(tgId);
  }
  q += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = db.prepare(q).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM hosting_security_logs').get().count;

  return { logs, total, page, limit };
}

module.exports = {
  getTOS,
  getPlan,
  getUserSites,
  getSiteById,
  checkUserLimits,
  deploySite,
  deleteSite,
  recordSiteVisit,
  getAllSitesAdmin,
  getSecurityLogs
};
