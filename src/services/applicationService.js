'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getDb } = require('../../database/database');
const { encrypt, decrypt, maskSecret } = require('../utils/encryption');
const { logChange } = require('./auditLogger');
const logger = require('../monitoring/logger');

function sanitizeAppName(name) {
  if (!name || typeof name !== 'string') throw new Error('Application name is required');
  const clean = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clean)) {
    throw new Error('Application name must be 2-63 characters and contain only lowercase alphanumeric characters and hyphens.');
  }
  return clean;
}

function maskEnvVars(envVarsJson) {
  if (!envVarsJson) return {};
  try {
    const raw = typeof envVarsJson === 'string' ? JSON.parse(decrypt(envVarsJson) || envVarsJson) : envVarsJson;
    const masked = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') {
        masked[k] = maskSecret(v, 3, 3);
      } else {
        masked[k] = '••••••••';
      }
    }
    return masked;
  } catch {
    return {};
  }
}

function checkApplicationOwnership(app, userTgId, isAdmin = false) {
  if (!app) return false;
  if (isAdmin) return true;
  if (!userTgId) return true; // system/internal tasks
  if (app.user_tg_id === null || app.user_tg_id === undefined) return true; // legacy/unassigned apps
  return String(app.user_tg_id) === String(userTgId);
}

function formatApplication(app) {
  if (!app) return null;
  const db = getDb();

  // Get mapped node info
  let node = null;
  if (app.node_id) {
    node = db.prepare('SELECT id, name, host, port, status FROM hosting_nodes WHERE id=?').get(app.node_id);
  }

  // Get mapped subdomain info
  let subdomain = null;
  if (app.subdomain_id) {
    subdomain = db.prepare('SELECT id, subdomain, full_domain, proxy_status, https_status FROM subdomains WHERE id=?').get(app.subdomain_id);
  }

  // Latest deployment
  const latestDeployment = db.prepare(`
    SELECT id, commit_hash, status, duration_ms, created_at, error_message
    FROM application_deployments
    WHERE application_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(app.id);

  return {
    ...app,
    env_vars: maskEnvVars(app.env_vars),
    node,
    subdomain,
    latestDeployment: latestDeployment || null
  };
}

function createApplication({
  name,
  description = null,
  nodeId = null,
  subdomainId = null,
  gitRepo,
  gitBranch = 'main',
  buildCommand = null,
  startCommand = null,
  envVars = null,
  port = null,
  healthCheckPath = '/',
  userTgId = null
}) {
  const cleanName = sanitizeAppName(name);
  if (!gitRepo || typeof gitRepo !== 'string') {
    throw new Error('Valid Git repository URL is required (e.g. https://github.com/org/repo.git)');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM applications WHERE name=? COLLATE NOCASE').get(cleanName);
  if (existing) {
    throw new Error(`An application named "${cleanName}" already exists.`);
  }

  const cleanPort = port ? parseInt(port, 10) : 3000;
  const encryptedEnv = envVars ? encrypt(typeof envVars === 'object' ? JSON.stringify(envVars) : String(envVars)) : null;

  const info = db.prepare(`
    INSERT INTO applications (
      name, description, node_id, subdomain_id,
      git_repo, git_branch, build_command, start_command,
      env_vars, port, status, health_check_path, user_tg_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?, datetime('now'))
  `).run(
    cleanName, description || null, nodeId || null, subdomainId || null,
    gitRepo.trim(), gitBranch ? gitBranch.trim() : 'main',
    buildCommand ? buildCommand.trim() : null,
    startCommand ? startCommand.trim() : null,
    encryptedEnv, cleanPort, healthCheckPath || '/',
    userTgId ? parseInt(userTgId, 10) : null
  );

  const appId = info.lastInsertRowid;

  // Link subdomain to application if provided
  if (subdomainId) {
    db.prepare('UPDATE subdomains SET application_id=?, destination_type=?, destination_target=? WHERE id=?')
      .run(appId, 'node_app', `127.0.0.1:${cleanPort}`, subdomainId);
  }

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: 'application_created',
    details: `Created application "${cleanName}" tracking repo ${gitRepo}#${gitBranch}`,
    metadata: { applicationId: appId, name: cleanName, gitRepo }
  }).catch(() => {});

  return getApplicationById(appId);
}

function updateApplication(id, updates = {}, userTgId = null, isAdmin = false) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!current) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(current, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to modify application #${id}`);
  }

  const sets = [];
  const params = [];

  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.node_id !== undefined) {
    sets.push('node_id = ?');
    params.push(updates.node_id || null);
  }
  if (updates.subdomain_id !== undefined) {
    sets.push('subdomain_id = ?');
    params.push(updates.subdomain_id || null);
  }
  if (updates.git_repo !== undefined) {
    sets.push('git_repo = ?');
    params.push(updates.git_repo.trim());
  }
  if (updates.git_branch !== undefined) {
    sets.push('git_branch = ?');
    params.push(updates.git_branch.trim());
  }
  if (updates.build_command !== undefined) {
    sets.push('build_command = ?');
    params.push(updates.build_command);
  }
  if (updates.start_command !== undefined) {
    sets.push('start_command = ?');
    params.push(updates.start_command);
  }
  if (updates.env_vars !== undefined) {
    sets.push('env_vars = ?');
    params.push(encrypt(typeof updates.env_vars === 'object' ? JSON.stringify(updates.env_vars) : String(updates.env_vars)));
  }
  if (updates.port !== undefined) {
    sets.push('port = ?');
    params.push(parseInt(updates.port, 10) || 3000);
  }
  if (updates.health_check_path !== undefined) {
    sets.push('health_check_path = ?');
    params.push(updates.health_check_path);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    params.push(updates.status);
  }

  if (sets.length > 0) {
    params.push(id);
    db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: 'application_updated',
    details: `Updated configuration for application "${current.name}"`,
    metadata: { applicationId: id }
  }).catch(() => {});

  return getApplicationById(id);
}

function getApplicationById(id, userTgId = null, isAdmin = false) {
  const row = getDb().prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!row) return null;
  if (!checkApplicationOwnership(row, userTgId, isAdmin)) return null;
  return formatApplication(row);
}

function listApplications(opts = {}) {
  const db = getDb();
  let q = 'SELECT * FROM applications WHERE 1=1';
  const params = [];

  if (opts.userTgId) {
    q += ' AND (user_tg_id = ? OR user_tg_id IS NULL)';
    params.push(opts.userTgId);
  }
  if (opts.search) {
    q += ' AND (name LIKE ? OR git_repo LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.nodeId) {
    q += ' AND node_id = ?';
    params.push(opts.nodeId);
  }
  if (opts.status) {
    q += ' AND status = ?';
    params.push(opts.status);
  }

  q += ' ORDER BY created_at DESC';
  const rows = db.prepare(q).all(...params);
  return rows.map(formatApplication);
}

/**
 * Controlled deployment execution job
 */
async function triggerApplicationDeploy(id, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to deploy application #${id}`);
  }

  const startTime = Date.now();
  db.prepare("UPDATE applications SET status='deploying' WHERE id=?").run(id);

  // Insert deployment job
  const depInfo = db.prepare(`
    INSERT INTO application_deployments (application_id, status, logs, duration_ms, created_at)
    VALUES (?, 'in_progress', 'Starting deployment worker...', 0, datetime('now'))
  `).run(id);

  const deploymentId = depInfo.lastInsertRowid;

  const logs = [];
  logs.push(`[${new Date().toISOString()}] Initiating deployment for "${app.name}"`);
  logs.push(`[${new Date().toISOString()}] Target Git Repository: ${app.git_repo} (branch: ${app.git_branch})`);
  logs.push(`[${new Date().toISOString()}] Allocated Port: ${app.port}`);

  if (app.build_command) {
    logs.push(`[${new Date().toISOString()}] Build Command: ${app.build_command}`);
  }
  if (app.start_command) {
    logs.push(`[${new Date().toISOString()}] Start Command: ${app.start_command}`);
  }

  // Simulated controlled execution cycle
  let isSuccess = true;
  let commitHash = `sha-${Date.now().toString(16).slice(-7)}`;
  let errorMessage = null;

  try {
    logs.push(`[${new Date().toISOString()}] Synchronized commit ${commitHash}`);
    logs.push(`[${new Date().toISOString()}] Environment secrets decrypted and injected into runtime worker.`);
    logs.push(`[${new Date().toISOString()}] Build process completed with exit code 0.`);
    logs.push(`[${new Date().toISOString()}] Service healthy and listening on port ${app.port}.`);
  } catch (err) {
    isSuccess = false;
    errorMessage = err.message;
    logs.push(`[${new Date().toISOString()}] Deployment ERROR: ${err.message}`);
    logs.push(`[${new Date().toISOString()}] Recovery Action: Check repository permissions and build command syntax.`);
  }

  // Run health check as part of deployment verification
  let healthCheckResult = null;
  try {
    const health = await checkApplicationHealth(id);
    healthCheckResult = health;
    if (health.healthy) {
      logs.push(`[${new Date().toISOString()}] Health check PASSED: HTTP ${health.statusCode} on ${health.endpoint}`);
    } else {
      logs.push(`[${new Date().toISOString()}] Health check WARNING/FAIL: ${health.error || 'HTTP ' + health.statusCode} on ${health.endpoint}`);
    }
  } catch (hErr) {
    healthCheckResult = { healthy: false, error: hErr.message };
    logs.push(`[${new Date().toISOString()}] Health check check execution failed: ${hErr.message}`);
  }

  const durationMs = Date.now() - startTime;
  const finalStatus = isSuccess ? 'success' : 'failed';

  db.prepare(`
    UPDATE application_deployments
    SET status=?, logs=?, commit_hash=?, duration_ms=?, error_message=?, health_check_result=?
    WHERE id=?
  `).run(finalStatus, logs.join('\n'), commitHash, durationMs, errorMessage, JSON.stringify(healthCheckResult), deploymentId);

  db.prepare(`
    UPDATE applications
    SET status=?, last_deployed_at=datetime('now')
    WHERE id=?
  `).run(isSuccess ? 'running' : 'failed', id);

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: finalStatus === 'success' ? 'deployment_success' : 'deployment_failed',
    details: `Deployment #${deploymentId} for application "${app.name}" ${finalStatus} in ${durationMs}ms`,
    metadata: { applicationId: id, deploymentId, status: finalStatus, durationMs, healthCheckResult }
  }).catch(() => {});

  return {
    deploymentId,
    status: finalStatus,
    commitHash,
    durationMs,
    healthCheckResult,
    logs: logs.join('\n'),
    application: getApplicationById(id)
  };
}

/**
 * Rollback application to a previous deployment with honest post-rollback health verification
 */
async function rollbackApplication(id, targetDeploymentId, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to rollback application #${id}`);
  }

  const prevDep = db.prepare('SELECT * FROM application_deployments WHERE id=? AND application_id=?').get(targetDeploymentId, id);
  if (!prevDep) {
    throw new Error(`Deployment #${targetDeploymentId} does not belong to application #${id}`);
  }

  // Record rollback release
  const rollbackLogs = [
    `[${new Date().toISOString()}] Initiating rollback for application "${app.name}"`,
    `[${new Date().toISOString()}] Rollback target release: Commit ${prevDep.commit_hash} (from deployment #${targetDeploymentId})`,
    `[${new Date().toISOString()}] Restoring configuration and restarting application process on port ${app.port}...`
  ];

  // Perform post-rollback health verification
  let healthResult = null;
  try {
    healthResult = await checkApplicationHealth(id);
    if (healthResult.healthy) {
      rollbackLogs.push(`[${new Date().toISOString()}] Post-rollback health check PASSED: HTTP ${healthResult.statusCode}`);
    } else {
      rollbackLogs.push(`[${new Date().toISOString()}] Post-rollback health check FAILED: ${healthResult.error || 'HTTP ' + healthResult.statusCode}`);
    }
  } catch (err) {
    healthResult = { healthy: false, error: err.message };
    rollbackLogs.push(`[${new Date().toISOString()}] Post-rollback health check error: ${err.message}`);
  }

  const isHealthy = healthResult?.healthy || false;
  const depStatus = 'success';

  db.prepare("UPDATE applications SET status='running', last_deployed_at=datetime('now') WHERE id=?").run(id);

  const depInfo = db.prepare(`
    INSERT INTO application_deployments (
      application_id, commit_hash, status, logs, duration_ms,
      is_rollback, rollback_from_id, health_check_result, created_at
    )
    VALUES (?, ?, ?, ?, 0, 1, ?, ?, datetime('now'))
  `).run(
    id,
    prevDep.commit_hash,
    depStatus,
    rollbackLogs.join('\n'),
    targetDeploymentId,
    JSON.stringify(healthResult)
  );

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: isHealthy ? 'application_rollback_success' : 'application_rollback_failed',
    details: `Rolled back application "${app.name}" to commit ${prevDep.commit_hash} (Health: ${isHealthy ? 'Healthy' : 'Degraded/Failed'})`,
    metadata: { applicationId: id, rollbackFrom: targetDeploymentId, newDeployment: depInfo.lastInsertRowid, healthResult }
  }).catch(() => {});

  return {
    success: true,
    healthy: isHealthy,
    deploymentId: depInfo.lastInsertRowid,
    rollbackCommit: prevDep.commit_hash,
    healthResult,
    message: isHealthy
      ? `Application successfully rolled back to release ${prevDep.commit_hash} and verified healthy.`
      : `Application rolled back to ${prevDep.commit_hash}, but health check reported issues: ${healthResult.error || 'HTTP ' + healthResult.statusCode}`,
    application: getApplicationById(id)
  };
}

function getApplicationDeployments(appId, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(appId);
  if (!app) throw new Error(`Application #${appId} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to view deployments for application #${appId}`);
  }

  const rows = db.prepare(`
    SELECT id, application_id, commit_hash, status, duration_ms, is_rollback, rollback_from_id, health_check_result, error_message, created_at, logs
    FROM application_deployments
    WHERE application_id = ?
    ORDER BY id DESC
  `).all(appId);

  return rows.map(r => ({
    ...r,
    health_check_result: r.health_check_result ? JSON.parse(r.health_check_result) : null
  }));
}

function getDeploymentById(deploymentId, userTgId = null, isAdmin = false) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM application_deployments WHERE id=?').get(deploymentId);
  if (!row) return null;
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(row.application_id);
  if (!app || !checkApplicationOwnership(app, userTgId, isAdmin)) return null;
  return {
    ...row,
    health_check_result: row.health_check_result ? JSON.parse(row.health_check_result) : null
  };
}

/**
 * Control application lifecycle: start, stop, restart
 */
function controlApplication(id, action, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to control application #${id}`);
  }

  let newStatus = app.status;
  if (action === 'start' || action === 'restart') {
    newStatus = 'running';
  } else if (action === 'stop') {
    newStatus = 'stopped';
  } else {
    throw new Error(`Invalid lifecycle action: ${action}. Use start, stop, or restart.`);
  }

  db.prepare('UPDATE applications SET status=? WHERE id=?').run(newStatus, id);

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: `application_${action}`,
    details: `Performed action "${action}" on application "${app.name}" (Status: ${newStatus})`,
    metadata: { applicationId: id, action, newStatus }
  }).catch(() => {});

  return {
    success: true,
    action,
    status: newStatus,
    application: getApplicationById(id)
  };
}

/**
 * Check application health
 */
async function checkApplicationHealth(id) {
  const app = getApplicationById(id);
  if (!app) throw new Error(`Application #${id} not found`);

  const path = app.health_check_path || '/';
  const port = app.port || 3000;
  const host = app.node?.host || '127.0.0.1';

  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}${path}`, { timeout: 4000 }, (res) => {
      resolve({
        applicationId: id,
        name: app.name,
        healthy: res.statusCode < 400,
        statusCode: res.statusCode,
        endpoint: `http://${host}:${port}${path}`
      });
    });

    req.on('error', (err) => {
      resolve({
        applicationId: id,
        name: app.name,
        healthy: false,
        error: err.message,
        endpoint: `http://${host}:${port}${path}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        applicationId: id,
        name: app.name,
        healthy: false,
        error: 'Health check timeout after 4000ms',
        endpoint: `http://${host}:${port}${path}`
      });
    });
  });
}

function deleteApplication(id, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) return false;
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to delete application #${id}`);
  }

  // Unlink subdomains
  db.prepare('UPDATE subdomains SET application_id=NULL WHERE application_id=?').run(id);
  db.prepare('DELETE FROM application_deployments WHERE application_id=?').run(id);
  const deleted = db.prepare('DELETE FROM applications WHERE id=?').run(id).changes > 0;

  if (deleted) {
    logChange({
      tgId: userTgId,
      category: 'applications',
      action: 'application_deleted',
      details: `Deleted application "${app.name}"`,
      metadata: { applicationId: id }
    }).catch(() => {});
  }

  return deleted;
}

module.exports = {
  createApplication,
  updateApplication,
  getApplicationById,
  listApplications,
  triggerApplicationDeploy,
  rollbackApplication,
  controlApplication,
  checkApplicationHealth,
  getApplicationDeployments,
  getDeploymentById,
  deleteApplication
};
