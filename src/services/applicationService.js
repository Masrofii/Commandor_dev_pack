'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getDb } = require('../../database/database');
const config = require('../../config/config');
const { encrypt, decrypt, maskSecret } = require('../utils/encryption');
const { logChange } = require('./auditLogger');
const appRunner = require('./appRunnerService');
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

function normalizeDescription(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Description must be a string');
  const clean = value.trim();
  if (clean.length > 2000) throw new Error('Description must be at most 2000 characters');
  return clean || null;
}

function normalizePort(value, fallback = appRunner.DEFAULT_APP_PORT) {
  const port = value === null || value === undefined || value === ''
    ? fallback
    : (typeof value === 'number' ? value : Number(String(value).trim()));
  return appRunner.assertUsableAppPort(port);
}

function normalizeHealthCheckPath(value) {
  const clean = String(value || '/').trim();
  if (!clean.startsWith('/')) throw new Error('Health check path must start with "/"');
  if (clean.length > 512) throw new Error('Health check path must be at most 512 characters');
  if (/[\s\u0000-\u001f\u007f]/.test(clean)) {
    throw new Error('Health check path must not contain whitespace or control characters');
  }
  return clean;
}

function normalizeEnvVarsInput(envVars) {
  if (envVars === null || envVars === undefined) return null;
  let raw = envVars;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error('Environment variables must be a JSON object');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Environment variables must be a JSON object');
  }
  // Reuse the runner's key/value validation so create/update and execution
  // agree on what a valid environment block is.
  return appRunner.parseEnvVars({ env_vars: JSON.stringify(raw) });
}

function normalizeNodeId(nodeId) {
  if (nodeId === null || nodeId === undefined || nodeId === '') return null;
  const id = typeof nodeId === 'number' ? nodeId : Number(String(nodeId).trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid node id');
  const node = getDb().prepare('SELECT id FROM hosting_nodes WHERE id=?').get(id);
  if (!node) throw new Error(`Node #${id} not found`);
  return id;
}

function normalizeSubdomainId(subdomainId) {
  if (subdomainId === null || subdomainId === undefined || subdomainId === '') return null;
  const id = typeof subdomainId === 'number' ? subdomainId : Number(String(subdomainId).trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid subdomain id');
  return id;
}

function assertSubdomainLinkAccess(subdomainId, userTgId, isAdmin) {
  const sub = getDb().prepare(
    'SELECT id, tg_id, full_domain, destination_type, application_id FROM subdomains WHERE id=?'
  ).get(subdomainId);
  if (!sub) throw new Error(`Subdomain #${subdomainId} not found`);
  if (!isAdmin) {
    if (!userTgId || sub.tg_id === null || sub.tg_id === undefined ||
        String(sub.tg_id) !== String(userTgId)) {
      throw new Error(`Unauthorized: You do not have access to subdomain #${subdomainId}`);
    }
  }
  return sub;
}

function assertSubdomainCanHostApp(sub) {
  const type = sub.destination_type;
  if (type && !['internal_service', 'node_app'].includes(type)) {
    throw new Error(
      `Subdomain "${sub.full_domain}" uses the "${type}" destination and cannot be linked to an application. ` +
      'Choose an internal service destination instead.'
    );
  }
}

function linkSubdomain(subdomainId, appId, port) {
  const target = `127.0.0.1:${port}`;
  getDb().prepare(`
    UPDATE subdomains
    SET application_id=?, destination_type='internal_service', destination_target=?,
        web_enabled=1, web_mode='proxy', web_target=?
    WHERE id=?
  `).run(appId, target, `http://${target}`, subdomainId);
}

function unlinkSubdomain(subdomainId, appId) {
  getDb().prepare(
    'UPDATE subdomains SET application_id=NULL WHERE id=? AND application_id=?'
  ).run(subdomainId, appId);
}

function refreshLinkedDestination(appId, port) {
  const target = `127.0.0.1:${port}`;
  getDb().prepare(`
    UPDATE subdomains
    SET destination_target=?, web_target=?
    WHERE application_id=? AND destination_type='internal_service'
  `).run(target, `http://${target}`, appId);
}

function checkApplicationOwnership(app, userTgId, isAdmin = false) {
  if (!app) return false;
  if (isAdmin) return true;
  if (!userTgId) return true; // system/internal tasks
  if (app.user_tg_id === null || app.user_tg_id === undefined) return true; // legacy/unassigned apps
  return String(app.user_tg_id) === String(userTgId);
}

function assertCanExecuteLocal(app, userTgId, isAdmin) {
  if (appRunner.isMockRunner() || config.apps.allowUserDeployments) return;
  const role = isAdmin ? 'admin' : getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(userTgId)?.role;
  if (role !== 'admin') {
    throw new Error(
      'Local application execution is restricted to administrators. ' +
      'Set APP_ALLOW_USER_DEPLOYMENTS=true to let regular users run code on this host.'
    );
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
    ORDER BY id DESC
    LIMIT 1
  `).get(app.id);

  return {
    ...app,
    env_vars: maskEnvVars(app.env_vars),
    node,
    subdomain,
    latestDeployment: latestDeployment || null,
    runtime: {
      runner: app.runner || appRunner.getRunnerType(),
      running: appRunner.isAppProcessRunning(app),
      lastError: app.last_error || null,
      workspaceReady: Boolean(app.workspace_path)
    }
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
  userTgId = null,
  isAdmin = false
}) {
  const cleanName = sanitizeAppName(name);
  const cleanRepo = appRunner.assertSafeGitUrl(gitRepo);
  const cleanBranch = appRunner.assertSafeBranch(gitBranch || 'main');
  const cleanBuildCommand = buildCommand ? appRunner.assertSafeCommand(buildCommand, 'Build command') : null;
  const cleanStartCommand = startCommand ? appRunner.assertSafeCommand(startCommand, 'Start command') : null;
  const cleanDescription = normalizeDescription(description);
  const cleanPort = normalizePort(port, appRunner.DEFAULT_APP_PORT);
  const cleanHealthPath = normalizeHealthCheckPath(healthCheckPath);
  const cleanNodeId = normalizeNodeId(nodeId);
  const parsedSubdomainId = normalizeSubdomainId(subdomainId);
  const cleanEnv = normalizeEnvVarsInput(envVars);

  const db = getDb();
  const existing = db.prepare('SELECT id FROM applications WHERE name=? COLLATE NOCASE').get(cleanName);
  if (existing) {
    throw new Error(`An application named "${cleanName}" already exists.`);
  }

  const portOwner = db.prepare('SELECT id, name FROM applications WHERE port=?').get(cleanPort);
  if (portOwner) {
    throw new Error(`Port ${cleanPort} is already assigned to application "${portOwner.name}".`);
  }

  let subdomain = null;
  if (parsedSubdomainId) {
    subdomain = assertSubdomainLinkAccess(parsedSubdomainId, userTgId, isAdmin);
    assertSubdomainCanHostApp(subdomain);
    if (subdomain.application_id && Number(subdomain.application_id) !== Number(0)) {
      throw new Error(`Subdomain "${subdomain.full_domain}" is already linked to another application.`);
    }
  }

  const encryptedEnv = cleanEnv ? encrypt(JSON.stringify(cleanEnv)) : null;

  const info = db.prepare(`
    INSERT INTO applications (
      name, description, node_id, subdomain_id,
      git_repo, git_branch, build_command, start_command,
      env_vars, port, status, health_check_path, user_tg_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?, datetime('now'))
  `).run(
    cleanName, cleanDescription, cleanNodeId, parsedSubdomainId,
    cleanRepo, cleanBranch,
    cleanBuildCommand,
    cleanStartCommand,
    encryptedEnv, cleanPort, cleanHealthPath,
    userTgId ? parseInt(userTgId, 10) : null
  );

  const appId = info.lastInsertRowid;

  // Link subdomain to application if provided. Local runner applications are
  // internal services on the loopback interface; never create an admin-only
  // node_app route from an unprivileged request.
  if (parsedSubdomainId) {
    linkSubdomain(parsedSubdomainId, appId, cleanPort);
  }

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: 'application_created',
    details: `Created application "${cleanName}" tracking repo ${cleanRepo}#${cleanBranch}`,
    metadata: { applicationId: appId, name: cleanName, gitRepo: cleanRepo }
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
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Application update payload must be an object');
  }

  const sets = [];
  const params = [];
  let nextPort = current.port;

  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(normalizeDescription(updates.description));
  }
  if (updates.node_id !== undefined) {
    sets.push('node_id = ?');
    params.push(normalizeNodeId(updates.node_id));
  }
  if (updates.git_repo !== undefined) {
    sets.push('git_repo = ?');
    params.push(appRunner.assertSafeGitUrl(updates.git_repo));
  }
  if (updates.git_branch !== undefined) {
    sets.push('git_branch = ?');
    params.push(appRunner.assertSafeBranch(updates.git_branch));
  }
  if (updates.build_command !== undefined) {
    sets.push('build_command = ?');
    params.push(updates.build_command ? appRunner.assertSafeCommand(updates.build_command, 'Build command') : null);
  }
  if (updates.start_command !== undefined) {
    sets.push('start_command = ?');
    params.push(updates.start_command ? appRunner.assertSafeCommand(updates.start_command, 'Start command') : null);
  }
  if (updates.env_vars !== undefined) {
    const cleanEnv = normalizeEnvVarsInput(updates.env_vars);
    sets.push('env_vars = ?');
    params.push(cleanEnv ? encrypt(JSON.stringify(cleanEnv)) : null);
  }
  if (updates.port !== undefined) {
    nextPort = normalizePort(updates.port, current.port || appRunner.DEFAULT_APP_PORT);
    const portOwner = db.prepare('SELECT id, name FROM applications WHERE port=? AND id<>?').get(nextPort, id);
    if (portOwner) {
      throw new Error(`Port ${nextPort} is already assigned to application "${portOwner.name}".`);
    }
    sets.push('port = ?');
    params.push(nextPort);
  }
  if (updates.health_check_path !== undefined) {
    sets.push('health_check_path = ?');
    params.push(normalizeHealthCheckPath(updates.health_check_path));
  }

  let nextSubdomain = null;
  if (updates.subdomain_id !== undefined) {
    const parsed = normalizeSubdomainId(updates.subdomain_id);
    if (parsed) {
      nextSubdomain = assertSubdomainLinkAccess(parsed, userTgId, isAdmin);
      assertSubdomainCanHostApp(nextSubdomain);
      if (nextSubdomain.application_id && Number(nextSubdomain.application_id) !== Number(id)) {
        throw new Error(`Subdomain "${nextSubdomain.full_domain}" is already linked to another application.`);
      }
    }
    sets.push('subdomain_id = ?');
    params.push(parsed);
  }

  // Status is lifecycle-managed (deploy/control), not user-editable. Ignoring
  // it here prevents clients from marking a stopped process as running.

  if (sets.length > 0) {
    params.push(id);
    db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  if (updates.subdomain_id !== undefined) {
    if (current.subdomain_id && Number(current.subdomain_id) !== Number(nextSubdomain?.id || 0)) {
      unlinkSubdomain(current.subdomain_id, id);
    }
    if (nextSubdomain) linkSubdomain(nextSubdomain.id, id, nextPort);
  } else if (updates.port !== undefined) {
    refreshLinkedDestination(id, nextPort);
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
 * Deployment execution job. Uses the real local runner when configured, or a
 * clearly-labelled simulated cycle in mock/test mode.
 */
async function triggerApplicationDeploy(id, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to deploy application #${id}`);
  }
  if (app.status === 'deploying') {
    throw new Error(`Application #${id} already has a deployment in progress`);
  }
  assertCanExecuteLocal(app, userTgId, isAdmin);

  const startTime = Date.now();
  const runnerType = appRunner.isMockRunner() ? 'mock' : 'local';
  db.prepare("UPDATE applications SET status='deploying', last_error=NULL WHERE id=?").run(id);

  // Insert deployment job
  const depInfo = db.prepare(`
    INSERT INTO application_deployments (application_id, status, logs, duration_ms, created_at)
    VALUES (?, 'in_progress', 'Starting deployment worker...', 0, datetime('now'))
  `).run(id);

  const deploymentId = depInfo.lastInsertRowid;

  const logs = [];
  logs.push(`[${new Date().toISOString()}] Initiating deployment for "${app.name}"`);
  logs.push(`[${new Date().toISOString()}] Execution mode: ${runnerType === 'local' ? 'local runner' : 'simulated (APP_RUNNER=mock)'}`);
  logs.push(`[${new Date().toISOString()}] Target Git Repository: ${app.git_repo} (branch: ${app.git_branch})`);
  logs.push(`[${new Date().toISOString()}] Allocated Port: ${app.port}`);

  if (app.build_command) {
    logs.push(`[${new Date().toISOString()}] Build Command: ${app.build_command}`);
  }
  if (app.start_command) {
    logs.push(`[${new Date().toISOString()}] Start Command: ${app.start_command}`);
  }

  let isSuccess = false;
  let commitHash = null;
  let errorMessage = null;
  let healthCheckResult = null;
  let workspacePath = app.workspace_path || null;
  let runtimePid = null;
  let previousStillRunning = false;

  if (runnerType === 'local') {
    const result = await appRunner.deployApplication(app);
    for (const line of result.logs || []) {
      logs.push(`[${new Date().toISOString()}] ${line}`);
    }
    isSuccess = Boolean(result.success);
    commitHash = result.commitHash || null;
    errorMessage = result.error || null;
    workspacePath = result.workspacePath || workspacePath;
    runtimePid = result.pid || null;
    previousStillRunning = Boolean(result.previousStillRunning);
    healthCheckResult = result.health || (errorMessage ? { healthy: false, error: errorMessage } : null);
    if (isSuccess) {
      logs.push(`[${new Date().toISOString()}] Health check PASSED on port ${app.port}`);
    } else {
      logs.push(`[${new Date().toISOString()}] Deployment ERROR: ${errorMessage}`);
    }
  } else {
    // Simulated cycle retained for tests and for installations that explicitly
    // choose APP_RUNNER=mock. Logs say so plainly.
    try {
      commitHash = `sha-${Date.now().toString(16).slice(-7)}`;
      logs.push(`[${new Date().toISOString()}] Simulated commit ${commitHash}`);
      logs.push(`[${new Date().toISOString()}] Environment secrets would be injected into the runtime worker.`);
      logs.push(`[${new Date().toISOString()}] Simulated build process completed with exit code 0.`);
      logs.push(`[${new Date().toISOString()}] Simulated service would listen on port ${app.port}.`);
      isSuccess = true;
    } catch (err) {
      errorMessage = err.message;
      logs.push(`[${new Date().toISOString()}] Deployment ERROR: ${err.message}`);
    }

    // Health checks are still useful when a real process happens to be running.
    try {
      healthCheckResult = await checkApplicationHealth(id);
      if (healthCheckResult.healthy) {
        logs.push(`[${new Date().toISOString()}] Health check PASSED: HTTP ${healthCheckResult.statusCode} on ${healthCheckResult.endpoint}`);
      } else {
        logs.push(`[${new Date().toISOString()}] Health check WARNING: ${healthCheckResult.error || 'HTTP ' + healthCheckResult.statusCode} on ${healthCheckResult.endpoint}`);
      }
    } catch (hErr) {
      healthCheckResult = { healthy: false, error: hErr.message };
      logs.push(`[${new Date().toISOString()}] Health check execution failed: ${hErr.message}`);
    }
  }

  const durationMs = Date.now() - startTime;
  const finalStatus = isSuccess ? 'success' : 'failed';

  db.prepare(`
    UPDATE application_deployments
    SET status=?, logs=?, commit_hash=?, duration_ms=?, error_message=?, health_check_result=?
    WHERE id=?
  `).run(finalStatus, logs.join('\n'), commitHash, durationMs, errorMessage, healthCheckResult ? JSON.stringify(healthCheckResult) : null, deploymentId);

  let finalStatusValue = isSuccess ? 'running' : 'failed';
  if (isSuccess && healthCheckResult && healthCheckResult.healthy === false && runnerType === 'local') {
    // A process that never became healthy is not "running" for the operator.
    finalStatusValue = 'failed';
  }
  if (!isSuccess && previousStillRunning) {
    // The build/checkout failed before the previous process was stopped. Keep
    // its PID and running status instead of orphaning a live process.
    finalStatusValue = 'running';
    const current = db.prepare('SELECT runtime_pid FROM applications WHERE id=?').get(id);
    runtimePid = current?.runtime_pid ?? null;
    errorMessage = `Deployment failed; previous version is still running: ${errorMessage}`;
  }

  db.prepare(`
    UPDATE applications
    SET status=?, last_deployed_at=datetime('now'), runner=?, workspace_path=?, runtime_pid=?, last_error=?
    WHERE id=?
  `).run(finalStatusValue, runnerType, workspacePath, runtimePid, errorMessage, id);

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: isSuccess ? 'deployment_success' : 'deployment_failed',
    details: `Deployment #${deploymentId} for application "${app.name}" ${finalStatus} in ${durationMs}ms (${runnerType})`,
    metadata: { applicationId: id, deploymentId, status: finalStatus, durationMs, runner: runnerType, healthCheckResult }
  }).catch(() => {});

  return {
    deploymentId,
    status: finalStatus,
    runner: runnerType,
    commitHash,
    durationMs,
    healthCheckResult,
    logs: logs.join('\n'),
    application: getApplicationById(id)
  };
}

/**
 * Rollback application to a previous deployment. In local runner mode this
 * checks out the recorded commit and rebuilds/restarts the process.
 */
async function rollbackApplication(id, targetDeploymentId, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to rollback application #${id}`);
  }
  assertCanExecuteLocal(app, userTgId, isAdmin);

  const prevDep = db.prepare('SELECT * FROM application_deployments WHERE id=? AND application_id=?').get(targetDeploymentId, id);
  if (!prevDep) {
    throw new Error(`Deployment #${targetDeploymentId} does not belong to application #${id}`);
  }
  if (!prevDep.commit_hash) {
    throw new Error(`Deployment #${targetDeploymentId} has no recorded commit to restore`);
  }

  const runnerType = appRunner.isMockRunner() ? 'mock' : 'local';
  const rollbackLogs = [
    `[${new Date().toISOString()}] Initiating rollback for application "${app.name}"`,
    `[${new Date().toISOString()}] Rollback target release: Commit ${prevDep.commit_hash} (from deployment #${targetDeploymentId})`,
    `[${new Date().toISOString()}] Execution mode: ${runnerType === 'local' ? 'local runner' : 'simulated (APP_RUNNER=mock)'}`
  ];

  let operationSuccess = true;
  let healthResult = null;
  let runtimePid = null;
  let previousStillRunning = false;

  if (runnerType === 'local') {
    const result = await appRunner.rollbackToCommit(app, prevDep.commit_hash);
    for (const line of result.logs || []) {
      rollbackLogs.push(`[${new Date().toISOString()}] ${line}`);
    }
    operationSuccess = Boolean(result.success);
    healthResult = result.health || { healthy: false, error: result.error || 'Rollback failed' };
    runtimePid = result.pid || null;
    previousStillRunning = Boolean(result.previousStillRunning);
    if (operationSuccess) {
      rollbackLogs.push(`[${new Date().toISOString()}] Post-rollback health check PASSED on port ${app.port}`);
    } else {
      rollbackLogs.push(`[${new Date().toISOString()}] Rollback failed: ${result.error}`);
    }
  } else {
    try {
      healthResult = await checkApplicationHealth(id);
      if (healthResult.healthy) {
        rollbackLogs.push(`[${new Date().toISOString()}] Simulated rollback health check PASSED: HTTP ${healthResult.statusCode}`);
      } else {
        rollbackLogs.push(`[${new Date().toISOString()}] Simulated rollback health check WARNING: ${healthResult.error || 'HTTP ' + healthResult.statusCode}`);
      }
    } catch (err) {
      healthResult = { healthy: false, error: err.message };
      rollbackLogs.push(`[${new Date().toISOString()}] Simulated rollback health check error: ${err.message}`);
    }
  }

  const isHealthy = Boolean(healthResult?.healthy);
  const depStatus = operationSuccess && (runnerType === 'mock' || isHealthy) ? 'success' : 'failed';
  let finalStatusValue = operationSuccess ? 'running' : 'failed';
  let finalError = operationSuccess ? null : (healthResult?.error || 'Rollback failed');

  if (!operationSuccess && previousStillRunning) {
    finalStatusValue = 'running';
    const current = db.prepare('SELECT runtime_pid FROM applications WHERE id=?').get(id);
    runtimePid = current?.runtime_pid ?? null;
    finalError = `Rollback failed; previous version is still running: ${finalError}`;
  }

  db.prepare(`
    UPDATE applications
    SET status=?, last_deployed_at=datetime('now'), runner=?, runtime_pid=?, last_error=?
    WHERE id=?
  `).run(finalStatusValue, runnerType, runtimePid, finalError, id);

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
    healthResult ? JSON.stringify(healthResult) : null
  );

  logChange({
    tgId: userTgId,
    category: 'applications',
    action: operationSuccess ? 'application_rollback_success' : 'application_rollback_failed',
    details: `Rolled back application "${app.name}" to commit ${prevDep.commit_hash} (${runnerType}, health: ${isHealthy ? 'healthy' : 'degraded/failed'})`,
    metadata: { applicationId: id, rollbackFrom: targetDeploymentId, newDeployment: depInfo.lastInsertRowid, healthResult }
  }).catch(() => {});

  return {
    success: operationSuccess,
    healthy: isHealthy,
    runner: runnerType,
    deploymentId: depInfo.lastInsertRowid,
    rollbackCommit: prevDep.commit_hash,
    healthResult,
    message: operationSuccess
      ? (isHealthy
        ? `Application successfully rolled back to release ${prevDep.commit_hash} and verified healthy.`
        : `Application was rolled back to ${prevDep.commit_hash}, but its health check did not pass.`)
      : `Rollback to ${prevDep.commit_hash} failed: ${healthResult?.error || 'unknown error'}`,
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
 * Control application lifecycle: start, stop, restart.
 *
 * Mock mode keeps the historical synchronous behaviour used by tests. Local
 * mode returns a promise that performs real process supervision.
 */
function controlApplication(id, action, userTgId = null, isAdmin = false) {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  if (!app) throw new Error(`Application #${id} not found`);
  if (!checkApplicationOwnership(app, userTgId, isAdmin)) {
    throw new Error(`Unauthorized: You do not have permission to control application #${id}`);
  }
  if (!['start', 'stop', 'restart'].includes(action)) {
    throw new Error(`Invalid lifecycle action: ${action}. Use start, stop, or restart.`);
  }

  if (appRunner.isMockRunner()) {
    const newStatus = action === 'stop' ? 'stopped' : 'running';
    db.prepare('UPDATE applications SET status=?, runner=? WHERE id=?').run(newStatus, 'mock', id);
    logChange({
      tgId: userTgId,
      category: 'applications',
      action: `application_${action}`,
      details: `Performed simulated action "${action}" on application "${app.name}" (Status: ${newStatus})`,
      metadata: { applicationId: id, action, newStatus, runner: 'mock' }
    }).catch(() => {});
    return {
      success: true,
      action,
      status: newStatus,
      simulated: true,
      application: getApplicationById(id)
    };
  }

  assertCanExecuteLocal(app, userTgId, isAdmin);
  return (async () => {
    try {
      let result;
      if (action === 'stop') {
        result = await appRunner.stopApplication(app);
      } else if (action === 'start') {
        result = await appRunner.startApplication(app);
      } else {
        result = await appRunner.restartApplication(app);
      }
      const newStatus = action === 'stop' ? 'stopped' : 'running';
      db.prepare('UPDATE applications SET status=?, last_error=NULL WHERE id=?').run(newStatus, id);

      logChange({
        tgId: userTgId,
        category: 'applications',
        action: `application_${action}`,
        details: `Performed action "${action}" on application "${app.name}" (Status: ${newStatus})`,
        metadata: { applicationId: id, action, newStatus, runner: 'local', result }
      }).catch(() => {});

      return {
        success: true,
        action,
        status: newStatus,
        ...result,
        application: getApplicationById(id)
      };
    } catch (err) {
      db.prepare("UPDATE applications SET status=?, last_error=? WHERE id=?")
        .run(action === 'stop' ? 'running' : 'failed', err.message, id);
      throw err;
    }
  })();
}

/**
 * Check application health
 */
async function checkApplicationHealth(id) {
  const app = getApplicationById(id);
  if (!app) throw new Error(`Application #${id} not found`);

  const path = app.health_check_path || '/';
  const port = app.port || appRunner.DEFAULT_APP_PORT;
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

    // Clean up the workspace and any supervised process in the background.
    // Deletion itself stays synchronous for API/test compatibility.
    if (!appRunner.isMockRunner()) {
      appRunner.destroyApplication(app).catch(err => {
        logger.warn({ applicationId: id, err: err.message }, 'Failed to clean up application workspace');
      });
    }
  }

  return deleted;
}

function getApplicationRuntimeLogs(id, userTgId = null, isAdmin = false, maxBytes = 51200) {
  const app = getApplicationById(id, userTgId, isAdmin);
  if (!app) throw new Error(`Application #${id} not found`);
  return appRunner.getRuntimeLogs(app, maxBytes);
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
  getApplicationRuntimeLogs,
  deleteApplication
};
