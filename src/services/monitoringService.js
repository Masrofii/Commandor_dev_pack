'use strict';
const os = require('os');
const fs = require('fs');
const { getDb } = require('../../database/database');

function getHostSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const loadAvg = os.loadavg();
  const uptimeSeconds = os.uptime();

  let diskInfo = {
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    usagePercent: 0
  };

  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync('/');
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const usedBytes = totalBytes - freeBytes;
      diskInfo = {
        totalBytes,
        freeBytes,
        usedBytes,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
      };
    }
  } catch {}

  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Generic CPU',
    loadAvg: [
      Math.round(loadAvg[0] * 100) / 100,
      Math.round(loadAvg[1] * 100) / 100,
      Math.round(loadAvg[2] * 100) / 100
    ],
    memory: {
      totalMb: Math.round(totalMem / (1024 * 1024)),
      usedMb: Math.round(usedMem / (1024 * 1024)),
      freeMb: Math.round(freeMem / (1024 * 1024)),
      usagePercent: Math.round((usedMem / totalMem) * 100)
    },
    disk: diskInfo,
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds)
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getSystemOverview() {
  const db = getDb();
  const hostMetrics = getHostSystemMetrics();

  // Nodes summary
  const nodeStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='online' THEN 1 ELSE 0 END) as online,
      SUM(CASE WHEN status='offline' THEN 1 ELSE 0 END) as offline,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as error
    FROM hosting_nodes
    WHERE is_active = 1
  `).get();

  // Applications summary
  const appStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status='stopped' THEN 1 ELSE 0 END) as stopped,
      SUM(CASE WHEN status='deploying' THEN 1 ELSE 0 END) as deploying,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
    FROM applications
  `).get();

  // Domains & Subdomains summary
  const domainStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN verified=0 THEN 1 ELSE 0 END) as pending
    FROM custom_domains
  `).get();

  const subdomainStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN proxy_status='active' THEN 1 ELSE 0 END) as proxyActive,
      SUM(CASE WHEN https_status='active' THEN 1 ELSE 0 END) as httpsActive,
      SUM(CASE WHEN dns_status='propagated' THEN 1 ELSE 0 END) as dnsPropagated
    FROM subdomains
  `).get();

  // Recent deployments
  const recentDeployments = db.prepare(`
    SELECT d.id, d.commit_hash, d.status, d.duration_ms, d.created_at, a.name as application_name
    FROM application_deployments d
    JOIN applications a ON d.application_id = a.id
    ORDER BY d.created_at DESC
    LIMIT 5
  `).all();

  // Recent audit events
  const recentEvents = db.prepare(`
    SELECT id, category, action, details, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 8
  `).all();

  // Security threats
  let threatCount = 0;
  try {
    threatCount = db.prepare('SELECT COUNT(*) as c FROM hosting_security_logs').get()?.c || 0;
  } catch {}

  // Verified backups count
  let backupCount = 0;
  try {
    backupCount = db.prepare("SELECT COUNT(*) as c FROM system_backups WHERE status='verified'").get()?.c || 0;
  } catch {}

  return {
    timestamp: new Date().toISOString(),
    host: hostMetrics,
    nodes: {
      total: nodeStats.total || 0,
      online: nodeStats.online || 0,
      offline: nodeStats.offline || 0,
      error: nodeStats.error || 0
    },
    applications: {
      total: appStats.total || 0,
      running: appStats.running || 0,
      stopped: appStats.stopped || 0,
      deploying: appStats.deploying || 0,
      failed: appStats.failed || 0
    },
    domains: {
      total: domainStats.total || 0,
      verified: domainStats.verified || 0,
      pending: domainStats.pending || 0
    },
    subdomains: {
      total: subdomainStats.total || 0,
      proxyActive: subdomainStats.proxyActive || 0,
      httpsActive: subdomainStats.httpsActive || 0,
      dnsPropagated: subdomainStats.dnsPropagated || 0
    },
    security: {
      threatsBlocked: threatCount,
      verifiedBackups: backupCount
    },
    recentDeployments,
    recentEvents
  };
}

module.exports = {
  getHostSystemMetrics,
  getSystemOverview
};
