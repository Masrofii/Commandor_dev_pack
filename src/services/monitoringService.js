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

  // Resource capacity warnings
  const warnings = [];
  if (hostMetrics.disk.usagePercent >= 90) {
    warnings.push({ level: 'critical', type: 'disk', message: `Host root filesystem is critically full (${hostMetrics.disk.usagePercent}% used).` });
  } else if (hostMetrics.disk.usagePercent >= 80) {
    warnings.push({ level: 'warning', type: 'disk', message: `Host root filesystem disk usage is high (${hostMetrics.disk.usagePercent}% used).` });
  }

  if (hostMetrics.memory.usagePercent >= 90) {
    warnings.push({ level: 'critical', type: 'memory', message: `Host memory pressure is critical (${hostMetrics.memory.usagePercent}% allocated).` });
  } else if (hostMetrics.memory.usagePercent >= 80) {
    warnings.push({ level: 'warning', type: 'memory', message: `Host memory usage is elevated (${hostMetrics.memory.usagePercent}% allocated).` });
  }

  if (hostMetrics.loadAvg[0] > (hostMetrics.cpuCount * 1.5)) {
    warnings.push({ level: 'warning', type: 'cpu', message: `1-minute CPU load average (${hostMetrics.loadAvg[0]}) exceeds core capacity (${hostMetrics.cpuCount} cores).` });
  }

  if (nodeStats.error > 0 || nodeStats.offline > 0) {
    warnings.push({ level: 'warning', type: 'nodes', message: `${(nodeStats.error || 0) + (nodeStats.offline || 0)} cluster node(s) offline or reporting errors.` });
  }

  if (appStats.failed > 0) {
    warnings.push({ level: 'warning', type: 'applications', message: `${appStats.failed} application(s) are in failed or degraded state.` });
  }

  return {
    timestamp: new Date().toISOString(),
    host: hostMetrics,
    capacityWarnings: warnings,
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

/**
 * Visual Infrastructure Relationship Map (Topology)
 * Maps connections between DNS Providers, Custom Domains, Subdomains, Proxy Routes, Applications, and Cluster Nodes
 */
function getInfrastructureTopology() {
  const db = getDb();

  // 1. Fetch all entities
  const nodes = db.prepare('SELECT id, name, host, port, status, system_info, is_active FROM hosting_nodes').all();
  const domains = db.prepare('SELECT id, domain, dns_provider, dns_status, cert_status, routing_status, verified, active FROM custom_domains').all();
  const subdomains = db.prepare('SELECT id, domain_id, node_id, application_id, subdomain, full_domain, base_domain, destination_type, destination_target, dns_record_type, dns_status, proxy_status, https_status, active FROM subdomains').all();
  const routes = db.prepare('SELECT id, subdomain_id, server_name, upstream_target, is_active, last_reloaded_at FROM proxy_routes').all();
  const applications = db.prepare('SELECT id, name, node_id, subdomain_id, git_repo, git_branch, port, status, health_check_path FROM applications').all();

  const topologyNodes = [];
  const topologyEdges = [];

  // Group DNS Providers
  const providers = new Set();
  domains.forEach(d => providers.add(d.dns_provider || 'manual'));
  if (providers.size === 0) providers.add('manual');

  providers.forEach(prov => {
    topologyNodes.push({
      id: `provider-${prov}`,
      label: prov === 'cloudflare' ? 'Cloudflare DNS' : (prov === 'manual' ? 'Manual DNS' : prov),
      type: 'dns_provider',
      category: 'dns',
      status: 'healthy',
      healthState: 'healthy',
      data: { provider: prov }
    });
  });

  // Domains
  domains.forEach(d => {
    const isHealthy = d.verified === 1 && d.active === 1;
    const healthState = isHealthy ? 'healthy' : (d.verified === 0 ? 'unknown' : 'degraded');

    topologyNodes.push({
      id: `domain-${d.id}`,
      label: d.domain,
      type: 'domain',
      category: 'domain',
      status: d.dns_status || (d.verified ? 'active' : 'pending'),
      healthState,
      data: {
        domain: d.domain,
        verified: !!d.verified,
        dnsStatus: d.dns_status,
        certStatus: d.cert_status
      }
    });

    // Edge: Provider -> Domain
    topologyEdges.push({
      id: `edge-prov-${d.dns_provider || 'manual'}-dom-${d.id}`,
      from: `provider-${d.dns_provider || 'manual'}`,
      to: `domain-${d.id}`,
      label: 'manages zone',
      status: healthState
    });
  });

  // Cluster Nodes (VPS)
  nodes.forEach(n => {
    let healthState = 'unknown';
    if (n.status === 'online') healthState = 'healthy';
    else if (n.status === 'error') healthState = 'degraded';
    else if (n.status === 'offline') healthState = 'unhealthy';

    topologyNodes.push({
      id: `node-${n.id}`,
      label: n.name || n.host,
      type: 'node',
      category: 'node',
      status: n.status || 'unknown',
      healthState,
      data: {
        host: n.host,
        port: n.port,
        status: n.status,
        isActive: !!n.is_active
      }
    });
  });

  // Subdomains
  subdomains.forEach(s => {
    // Determine compound health state
    let healthState = 'healthy';
    if (s.proxy_status === 'failed' || s.dns_status === 'failed') {
      healthState = 'unhealthy';
    } else if (s.dns_status === 'pending' || s.proxy_status === 'unconfigured') {
      healthState = 'unknown';
    } else if (s.https_status === 'disabled') {
      healthState = 'degraded';
    }

    topologyNodes.push({
      id: `subdomain-${s.id}`,
      label: s.full_domain,
      type: 'subdomain',
      category: 'routing',
      status: s.proxy_status || 'active',
      healthState,
      indicators: {
        dnsResolution: s.dns_status === 'propagated' ? 'healthy' : (s.dns_status === 'failed' ? 'failed' : 'unknown'),
        httpReachability: s.proxy_status === 'active' ? 'healthy' : (s.proxy_status === 'failed' ? 'failed' : 'unknown'),
        tlsValidity: s.https_status === 'active' ? 'healthy' : (s.https_status === 'disabled' ? 'degraded' : 'unknown')
      },
      data: {
        fullDomain: s.full_domain,
        destinationType: s.destination_type,
        destinationTarget: s.destination_target,
        dnsRecordType: s.dns_record_type,
        dnsStatus: s.dns_status,
        proxyStatus: s.proxy_status,
        httpsStatus: s.https_status
      }
    });

    // Edge: Domain -> Subdomain
    if (s.domain_id) {
      topologyEdges.push({
        id: `edge-dom-${s.domain_id}-sub-${s.id}`,
        from: `domain-${s.domain_id}`,
        to: `subdomain-${s.id}`,
        label: 'subdomain of',
        status: healthState
      });
    }
  });

  // Applications
  applications.forEach(a => {
    let healthState = 'unknown';
    if (a.status === 'running') healthState = 'healthy';
    else if (a.status === 'deploying') healthState = 'unknown';
    else if (a.status === 'stopped') healthState = 'degraded';
    else if (a.status === 'failed') healthState = 'unhealthy';

    topologyNodes.push({
      id: `app-${a.id}`,
      label: a.name,
      type: 'application',
      category: 'service',
      status: a.status,
      healthState,
      indicators: {
        applicationHealth: healthState,
        port: a.port
      },
      data: {
        name: a.name,
        gitRepo: a.git_repo,
        gitBranch: a.git_branch,
        port: a.port,
        status: a.status,
        healthCheckPath: a.health_check_path
      }
    });

    // Edge: Subdomain -> Application
    if (a.subdomain_id) {
      topologyEdges.push({
        id: `edge-sub-${a.subdomain_id}-app-${a.id}`,
        from: `subdomain-${a.subdomain_id}`,
        to: `app-${a.id}`,
        label: `reverse proxy (:${a.port})`,
        status: healthState
      });
    }

    // Edge: Application -> Node
    if (a.node_id) {
      topologyEdges.push({
        id: `edge-app-${a.id}-node-${a.node_id}`,
        from: `app-${a.id}`,
        to: `node-${a.node_id}`,
        label: 'hosted on',
        status: healthState
      });
    }
  });

  return {
    timestamp: new Date().toISOString(),
    nodes: topologyNodes,
    edges: topologyEdges,
    summary: {
      providersCount: providers.size,
      domainsCount: domains.length,
      subdomainsCount: subdomains.length,
      applicationsCount: applications.length,
      nodesCount: nodes.length
    }
  };
}

module.exports = {
  getHostSystemMetrics,
  getSystemOverview,
  getInfrastructureTopology
};
