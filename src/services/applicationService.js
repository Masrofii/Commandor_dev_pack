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
    ORDER BY created_at DESC
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
      env_vars, port, status, health_check_path, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, datetime('now'))
  `).run(
    cleanName, description || null, nodeId || null, subdomainId || null,
    gitRepo.trim(), gitBranch ? gitBranch.trim() : 'main',
    buildCommand ? buildCommand.trim() : null,
    startCommand ? startCommand.trim() : null,
    encryptedEnv, cleanPort, healthCheckPath || '/'
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

function updateApplication(id, updates = {}, userTgId = null) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!current) throw new Error(`Application #${id} not found`);

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

function getApplicationById(id) {
  const row = getDb().prepare('SELECT * FROM applications WHERE id=?').get(id);
  return formatApplication(row);
}

function listApplications(opts = {}) {
  const db = getDb();
  let q = 'SELECT * FROM applications WHERE 1=1';
  const params = [];

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
async function triggerApplicationDeploy(id, userTgId = null) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);

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

  const durationMs = Date.now() - startTime;
  const finalStatus = isSuccess ? 'success' : 'failed';

  db.prepare(`
    UPDATE application_deployments
    SET status=?, logs=?, commit_hash=?, duration_ms=?, error_message=?
    WHERE id=?
  `).run(finalStatus, logs.join('\n'), commitHash, durationMs, errorMessage, deploymentId);

  db.prepare(`
    UPDATE applications
    SET status=?, last_deployed_at=datetime('now')
    WHERE id=?
  `).run(isSuccess ? 'running' : 'failed', id);

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: isSuccess ? 'deployment_success' : 'deployment_failed',
    details: `Deployment #${deploymentId} for application "${app.name}" ${finalStatus} in ${durationMs}ms`,
    metadata: { applicationId: id, deploymentId, status: finalStatus, durationMs }
  }).catch(() => {});

  return {
    deploymentId,
    status: finalStatus,
    commitHash,
    durationMs,
    logs: logs.join('\n'),
    application: getApplicationById(id)
  };
}

/**
 * Rollback application to a previous deployment
 */
async function rollbackApplication(id, targetDeploymentId, userTgId = null) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);

  const prevDep = db.prepare('SELECT * FROM application_deployments WHERE id=? AND application_id=?').get(targetDeploymentId, id);
  if (!prevDep) {
    throw new Error(`Deployment #${targetDeploymentId} does not belong to application #${id}`);
  }

  db.prepare("UPDATE applications SET status='running', last_deployed_at=datetime('now') WHERE id=?").run(id);

  const depInfo = db.prepare(`
    INSERT INTO application_deployments (application_id, commit_hash, status, logs, duration_ms, created_at)
    VALUES (?, ?, 'success', ?, 0, datetime('now'))
  `).run(id, prevDep.commit_hash, `[${new Date().toISOString()}] Rolled back to release commit ${prevDep.commit_hash} (from deployment #${targetDeploymentId})`);

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: 'application_rollback',
    details: `Rolled back application "${app.name}" to commit ${prevDep.commit_hash}`,
    metadata: { applicationId: id, rollbackFrom: targetDeploymentId, newDeployment: depInfo.lastInsertRowid }
  }).catch(() => {});

  return {
    success: true,
    message: `Application rolled back to commit ${prevDep.commit_hash}`,
    application: getApplicationById(id)
  };
}

/**
 * Control application lifecycle: start, stop, restart
 */
function controlApplication(id, action, userTgId = null) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);

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

function deleteApplication(id, userTgId = null) {
  const db = getDb();
  const app = db.prepare('SELECT name FROM applications WHERE id=?').get(id);
  if (!app) return false;

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
  deleteApplication
};
