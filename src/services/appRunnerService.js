'use strict';
/**
 * Local application runner.
 *
 * Deploys a Git repository into an isolated workspace, installs dependencies,
 * runs the configured build command, starts the process detached from the API,
 * and tracks its PID/log file so it can be stopped or restarted later.
 *
 * This is intentionally a single-host runner. It is not a container sandbox:
 * build and start commands execute with the privileges of the API process.
 * Set APP_RUNNER=mock to keep the old simulated behaviour.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const { spawn, execFile } = require('child_process');
const config = require('../../config/config');
const { getDb } = require('../../database/database');
const { decrypt } = require('../utils/encryption');
const logger = require('../monitoring/logger');

const IS_WINDOWS = process.platform === 'win32';
const MAX_CAPTURE_BYTES = 1024 * 1024;
const RUNTIME_FILE = '.commandor-runtime.json';
const DEFAULT_APP_PORT = 8080;
const ALWAYS_RESERVED_PORTS = new Set([80, 443]);

/**
 * Application processes must never bind the API or dashboard ports. Checking
 * this before validation and again at start time keeps a port conflict from
 * being reported as a mysterious health-check failure.
 */
function assertUsableAppPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Application port must be an integer between 1 and 65535');
  }
  const apiPort = Number(config.server?.port);
  const webPort = Number(config.server?.webPort);
  if (ALWAYS_RESERVED_PORTS.has(port) || port === apiPort || port === webPort) {
    throw new Error(
      `Port ${port} is reserved for the Commandor API, dashboard, or HTTP(S) listener; choose another application port`
    );
  }
  return port;
}

function checkPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    server.unref();
    server.once('error', (err) => {
      finish({
        available: false,
        error: err.code === 'EADDRINUSE'
          ? `Port ${port} is already in use by another process`
          : `Port ${port} is unavailable: ${err.message}`
      });
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => finish({ available: true }));
    });
  });
}

function getRunnerType() {
  const configured = String(config.apps?.runner || 'local').toLowerCase();
  return configured === 'mock' ? 'mock' : 'local';
}

function isMockRunner() {
  return getRunnerType() === 'mock';
}

function getDeployDir() {
  return path.resolve(config.apps?.deployDir || './data/apps');
}

function ensureDeployDir() {
  const dir = getDeployDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeAppName(name) {
  const clean = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(clean)) {
    throw new Error('Application name contains unsafe characters');
  }
  return clean;
}

function getWorkspacePath(app) {
  const root = ensureDeployDir();
  const workspace = path.resolve(root, sanitizeAppName(app.name));
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!workspace.startsWith(prefix)) {
    throw new Error('Application workspace escapes the deploy directory');
  }
  return workspace;
}

function assertSafeGitUrl(repo) {
  if (typeof repo !== 'string' || !repo || repo.length > 2048) {
    throw new Error('A valid Git repository URL is required');
  }
  const value = repo.trim();
  if (/[\u0000-\u001f\u007f\s]/.test(value)) {
    throw new Error('Git repository URL must not contain whitespace or control characters');
  }
  if (value.startsWith('-')) {
    throw new Error('Git repository URL must not start with a dash');
  }
  // SCP-style SSH remotes: git@github.com:owner/repo.git
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Git repository URL must be an absolute https://, ssh://, git:// or git@host:path URL');
  }
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported Git URL protocol: ${parsed.protocol}`);
  }
  return value;
}

function assertSafeBranch(branch) {
  const clean = String(branch || '').trim();
  if (!clean || clean.length > 120) {
    throw new Error('Git branch is required and must be at most 120 characters');
  }
  if (clean.startsWith('-') || clean.includes('..') || clean.includes('//') ||
      clean.startsWith('/') || clean.endsWith('/') || clean.endsWith('.lock') ||
      /[\s~^:?*[\\\u0000-\u001f\u007f]/.test(clean)) {
    throw new Error('Git branch contains invalid characters');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(clean)) {
    throw new Error('Git branch contains invalid characters');
  }
  return clean;
}

function assertSafeCommand(command, label) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (command.length > 4000) {
    throw new Error(`${label} is too long`);
  }
  if (/[\u0000\r\n]/.test(command)) {
    throw new Error(`${label} must be a single line without control characters`);
  }
  return command.trim();
}

function parseEnvVars(app) {
  const env = {};
  if (!app.env_vars) return env;
  let raw;
  try {
    raw = decrypt(app.env_vars);
  } catch {
    raw = null;
  }
  if (!raw) raw = app.env_vars;
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('Application environment variables are not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Application environment variables must be a JSON object');
  }
  const entries = Object.entries(parsed);
  if (entries.length > 200) throw new Error('Too many environment variables (maximum 200)');
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment variable name: ${key}`);
    }
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Environment variable ${key} must be a string, number or boolean`);
    }
    env[key] = String(value ?? '');
  }
  return env;
}

// Only pass the operating-system variables a child process needs to find its
// runtime and temporary directories. Server secrets (SESSION_SECRET,
// ENCRYPTION_KEY, bot tokens, DATABASE_URL, ...) must never leak into
// user-controlled build or start commands.
const SAFE_INHERITED_ENV_KEYS = [
  'PATH', 'Path',
  'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'PROGRAMDATA',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'
];

function buildProcessEnv(app) {
  const env = {};
  for (const key of SAFE_INHERITED_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  if (env.PATH === undefined && env.Path !== undefined) env.PATH = env.Path;
  if (env.Path === undefined && env.PATH !== undefined) env.Path = env.PATH;

  const appEnv = parseEnvVars(app);
  Object.assign(env, appEnv);
  if (env.NODE_ENV === undefined) env.NODE_ENV = 'production';

  env.PORT = String(app.port || DEFAULT_APP_PORT);
  env.COMMANDOR_APPLICATION = String(app.name || '');
  env.COMMANDOR_DEPLOY_DIR = getWorkspacePath(app);
  return env;
}

function appendChunk(buffer, chunk, limit = MAX_CAPTURE_BYTES) {
  const next = buffer + chunk.toString();
  return next.length > limit ? next.slice(-limit) : next;
}

function runCommand(command, { cwd, env, timeoutMs = config.apps?.commandTimeoutMs || 600000, label = 'Command' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminatePid(child.pid);
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout = appendChunk(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = appendChunk(stderr, chunk); });
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label} could not start: ${err.message}`));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const tail = (stderr || stdout).trim().split('\n').slice(-12).join('\n');
        reject(new Error(`${label} failed with exit code ${code}${tail ? `:\n${tail}` : ''}`));
      }
    });
  });
}

function runGit(args, { cwd, label = 'git' } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_CAPTURE_BYTES,
      timeout: config.apps?.commandTimeoutMs || 600000
    }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || stdout || err.message).trim().split('\n').slice(-8).join('\n');
        reject(new Error(`${label} failed: ${tail || err.message}`));
        return;
      }
      resolve(String(stdout || '').trim());
    });
    child.on('error', err => reject(new Error(`${label} failed to start: ${err.message}`)));
  });
}

function pathExists(...parts) {
  try {
    return fs.existsSync(path.join(...parts));
  } catch {
    return false;
  }
}

function readPackageJson(workspace) {
  const file = path.join(workspace, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('package.json is not valid JSON');
  }
}

function resolveInstallCommand(workspace, logs) {
  if (pathExists(workspace, 'package-lock.json')) return 'npm ci --no-audit --no-fund';
  if (pathExists(workspace, 'pnpm-lock.yaml')) return 'corepack pnpm install --frozen-lockfile';
  if (pathExists(workspace, 'yarn.lock')) return 'corepack yarn install --frozen-lockfile';
  if (pathExists(workspace, 'package.json')) return 'npm install --no-audit --no-fund';
  if (pathExists(workspace, 'requirements.txt')) return 'python -m pip install -r requirements.txt';
  if (pathExists(workspace, 'go.mod')) {
    logs.push('Go module detected. Build command must be supplied in the application settings.');
    return null;
  }
  return null;
}

function resolveStartCommand(app, workspace) {
  if (app.start_command) return assertSafeCommand(app.start_command, 'Start command');
  const pkg = readPackageJson(workspace);
  if (pkg?.scripts?.start) return 'npm start';
  if (pkg?.scripts?.serve) return 'npm run serve';
  if (pkg?.main && !pkg.main.includes('..')) return `node ${JSON.stringify(pkg.main)}`;
  for (const candidate of ['server.js', 'index.js', 'app.js', 'main.js']) {
    if (pathExists(workspace, candidate)) return `node ${candidate}`;
  }
  return null;
}

function resolveBuildCommand(app, workspace) {
  if (app.build_command) return assertSafeCommand(app.build_command, 'Build command');
  const pkg = readPackageJson(workspace);
  if (pkg?.scripts?.build) return 'npm run build';
  return null;
}

function getRuntimeFile(workspace) {
  return path.join(workspace, RUNTIME_FILE);
}

function readRuntimeState(app) {
  try {
    const workspace = getWorkspacePath(app);
    const file = getRuntimeFile(workspace);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeRuntimeState(app, state) {
  const workspace = getWorkspacePath(app);
  const file = getRuntimeFile(workspace);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function isProcessRunning(pid) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric === process.pid) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function isAppProcessRunning(app) {
  if (!app) return false;
  const state = readRuntimeState(app);
  if (!state || !state.pid) return false;
  if (Number(state.appId) !== Number(app.id)) return false;
  if (Number(state.pid) !== Number(app.runtime_pid)) return false;
  return isProcessRunning(state.pid);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function terminatePid(pid) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric === process.pid) return;
  if (!isProcessRunning(numeric)) return;

  if (IS_WINDOWS) {
    await new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(numeric), '/T', '/F'], { windowsHide: true }, () => resolve());
    });
    return;
  }

  try { process.kill(-numeric, 'SIGTERM'); } catch { try { process.kill(numeric, 'SIGTERM'); } catch {} }
  for (let i = 0; i < 20; i++) {
    if (!isProcessRunning(numeric)) return;
    await sleep(250);
  }
  try { process.kill(-numeric, 'SIGKILL'); } catch { try { process.kill(numeric, 'SIGKILL'); } catch {} }
}

async function stopTrackedProcess(app, { updateStatus = true } = {}) {
  const state = readRuntimeState(app);
  const db = getDb();
  const row = db.prepare('SELECT runtime_pid, status FROM applications WHERE id=?').get(app.id);
  const pid = Number(row?.runtime_pid || state?.pid || 0);
  let stopped = true;
  let reason = null;

  if (pid) {
    if (!isProcessRunning(pid)) {
      stopped = true;
    } else if (state && Number(state.pid) === pid && Number(state.appId) === Number(app.id)) {
      await terminatePid(pid);
      stopped = !isProcessRunning(pid);
      if (!stopped) reason = `Process ${pid} is still running after the stop request`;
    } else {
      // Never kill a PID we cannot prove belongs to this application: PIDs are
      // reused, and the old worker may now belong to an unrelated process.
      stopped = false;
      reason = `Refusing to stop PID ${pid}: the runtime marker is missing or does not match this application`;
      logger.warn({ appId: app.id, pid }, reason);
    }
  }

  if (stopped) {
    if (state) {
      writeRuntimeState(app, { ...state, pid: null, stoppedAt: new Date().toISOString() });
    }
    db.prepare('UPDATE applications SET runtime_pid=NULL WHERE id=?').run(app.id);
    if (updateStatus) {
      db.prepare("UPDATE applications SET status='stopped' WHERE id=?").run(app.id);
    }
  }

  return { stopped, pid, reason };
}

function openLogFile(app) {
  const dir = path.resolve(config.logging?.dir || './logs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `app-${Number(app.id) || 'unknown'}.log`);
  const fd = fs.openSync(file, 'a');
  return { file, fd };
}

function spawnStartProcess(app, workspace, command, env) {
  const { file, fd } = openLogFile(app);
  const logHeader = `\n--- Commandor start ${new Date().toISOString()} | app=${app.name} | command=${command} ---\n`;
  try { fs.writeSync(fd, logHeader); } catch {}

  const child = spawn(command, {
    cwd: workspace,
    env,
    shell: true,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fd, fd]
  });
  child.unref();
  try { fs.closeSync(fd); } catch {}

  if (!child.pid) {
    throw new Error('Failed to start application process');
  }
  return { pid: child.pid, logFile: file, child };
}

function probeHttp(port, healthPath, timeoutMs = 4000) {
  const requestPath = healthPath && healthPath.startsWith('/') ? healthPath : `/${healthPath || ''}`;
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${requestPath}`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ healthy: res.statusCode < 400, statusCode: res.statusCode });
    });
    req.on('error', (err) => resolve({ healthy: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: `Health check timeout after ${timeoutMs}ms` });
    });
  });
}

async function waitForHealthy(app, pid, { timeoutMs = config.apps?.startTimeoutMs || 45000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return { healthy: false, error: `Process exited before becoming healthy (pid ${pid})` };
    }
    last = await probeHttp(app.port, app.health_check_path || '/');
    if (last.healthy) return { healthy: true, statusCode: last.statusCode };
    await sleep(1000);
  }
  return {
    healthy: false,
    error: last?.error || `Application did not respond on port ${app.port} within ${Math.round(timeoutMs / 1000)}s`
  };
}

async function syncRepository(app, workspace, logs) {
  const repo = assertSafeGitUrl(app.git_repo);
  const branch = assertSafeBranch(app.git_branch || 'main');
  const gitDir = path.join(workspace, '.git');

  if (!fs.existsSync(gitDir)) {
    // The workspace may contain stale files but no repository. Clean it so a
    // fresh clone cannot fail due to partially removed directories.
    if (fs.existsSync(workspace)) {
      for (const entry of fs.readdirSync(workspace)) {
        fs.rmSync(path.join(workspace, entry), { recursive: true, force: true });
      }
    } else {
      fs.mkdirSync(workspace, { recursive: true });
    }
    logs.push(`Cloning ${repo} (${branch})...`);
    await runGit(['clone', '--branch', branch, '--single-branch', repo, workspace], { label: 'git clone' });
  } else {
    logs.push(`Fetching origin/${branch}...`);
    await runGit(['remote', 'set-url', 'origin', repo], { cwd: workspace, label: 'git remote set-url' });
    await runGit(['fetch', '--prune', 'origin', branch], { cwd: workspace, label: 'git fetch' });
    await runGit(['checkout', '--force', '-B', branch, `origin/${branch}`], { cwd: workspace, label: 'git checkout' });
    await runGit(['reset', '--hard', `origin/${branch}`], { cwd: workspace, label: 'git reset' });
    await runGit(['clean', '-fdx', '-e', RUNTIME_FILE], { cwd: workspace, label: 'git clean' });
  }

  const commitHash = await runGit(['rev-parse', 'HEAD'], { cwd: workspace, label: 'git rev-parse' });
  logs.push(`Checked out commit ${commitHash}`);
  return commitHash;
}

async function startAndTrack(app, workspace, { logs = [] } = {}) {
  const command = resolveStartCommand(app, workspace);
  if (!command) {
    throw new Error('No start command configured and no runnable Node entry point was detected');
  }
  const port = assertUsableAppPort(app.port || DEFAULT_APP_PORT);
  const availability = await checkPortAvailable(port);
  if (!availability.available) {
    throw new Error(availability.error || `Port ${port} is unavailable`);
  }
  logs.push(`Starting process on port ${port}: ${command}`);
  const env = buildProcessEnv(app);
  const { pid, logFile } = spawnStartProcess(app, workspace, command, env);
  logs.push(`Process started with PID ${pid}; logs: ${logFile}`);

  try {
    writeRuntimeState(app, {
      appId: Number(app.id),
      name: app.name,
      pid,
      command,
      logFile,
      startedAt: new Date().toISOString()
    });
    getDb().prepare("UPDATE applications SET runtime_pid=?, status='starting', runner='local', last_error=NULL WHERE id=?")
      .run(pid, app.id);

    const health = await waitForHealthy(app, pid);
    if (!health.healthy) {
      throw new Error(`Application failed to become healthy: ${health.error || 'unknown error'}`);
    }

    getDb().prepare("UPDATE applications SET status='running', last_error=NULL WHERE id=?").run(app.id);
    return { pid, logFile, health, command };
  } catch (err) {
    // Never leave a spawned child untracked when marker/DB/health handling
    // fails. Terminating here also makes the deployment failure path safe.
    await terminatePid(pid);
    try {
      writeRuntimeState(app, {
        appId: Number(app.id),
        name: app.name,
        pid: null,
        command,
        logFile,
        stoppedAt: new Date().toISOString(),
        lastError: err.message
      });
    } catch {}
    try {
      getDb().prepare("UPDATE applications SET runtime_pid=NULL, status='failed', last_error=? WHERE id=?")
        .run(err.message, app.id);
    } catch {}
    throw err;
  }
}

async function installAndBuild(app, workspace, logs) {
  const install = resolveInstallCommand(workspace, logs);
  if (install) {
    logs.push(`Installing dependencies: ${install}`);
    try {
      await runCommand(install, { cwd: workspace, env: buildProcessEnv(app), label: 'Dependency installation' });
    } catch (err) {
      // package-lock drift is common; retry with a normal install once before
      // giving up, but only for npm ci.
      if (install.startsWith('npm ci')) {
        logs.push('npm ci failed; retrying with npm install...');
        await runCommand('npm install --no-audit --no-fund', {
          cwd: workspace,
          env: buildProcessEnv(app),
          label: 'Dependency installation'
        });
      } else {
        throw err;
      }
    }
  } else {
    logs.push('No dependency manager detected; skipping install step.');
  }

  const build = resolveBuildCommand(app, workspace);
  if (build) {
    logs.push(`Building: ${build}`);
    await runCommand(build, { cwd: workspace, env: buildProcessEnv(app), label: 'Build' });
  } else {
    logs.push('No build command configured; skipping build step.');
  }
}

/**
 * Record a failed deployment without discarding a healthy previous version.
 * Before the old process is stopped, a build/checkout failure must leave the
 * application marked running and keep its tracked PID intact.
 */
function recordDeploymentFailure(app, err, { previousStopped = false, prefix = 'Deployment' } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT runtime_pid FROM applications WHERE id=?').get(app.id);
  const trackedPid = Number(row?.runtime_pid || 0);
  const previousStillRunning = !previousStopped && trackedPid > 0 && isProcessRunning(trackedPid);
  if (previousStillRunning) {
    db.prepare("UPDATE applications SET status='running', last_error=? WHERE id=?")
      .run(`${prefix} failed; previous version is still running: ${err.message}`, app.id);
  } else {
    db.prepare("UPDATE applications SET status='failed', runtime_pid=NULL, last_error=? WHERE id=?")
      .run(err.message, app.id);
  }
  return previousStillRunning;
}

/**
 * Full deploy: clone/fetch, install, build, restart and health-check.
 */
async function deployApplication(app) {
  if (isMockRunner()) {
    throw new Error('Mock runner cannot execute real deployments');
  }
  const logs = [];
  const workspace = getWorkspacePath(app);
  let startedPid = null;
  let previousStopped = false;

  try {
    logs.push(`Runner: local (${workspace})`);
    const commitHash = await syncRepository(app, workspace, logs);
    await installAndBuild(app, workspace, logs);
    const stopResult = await stopTrackedProcess(app, { updateStatus: false });
    if (!stopResult.stopped) {
      throw new Error(stopResult.reason || 'Could not stop the previous application process');
    }
    previousStopped = true;
    const started = await startAndTrack(app, workspace, { logs });
    startedPid = started.pid;
    logs.push(`Health check passed on port ${app.port}`);
    return {
      success: true,
      runner: 'local',
      commitHash,
      workspacePath: workspace,
      pid: started.pid,
      health: started.health,
      logs
    };
  } catch (err) {
    if (startedPid) await terminatePid(startedPid);
    const previousStillRunning = recordDeploymentFailure(app, err, { previousStopped });
    logs.push(`Deployment failed: ${err.message}`);
    if (previousStillRunning) {
      logs.push('The previously running version was left untouched and is still serving traffic.');
    }
    return {
      success: false,
      runner: 'local',
      commitHash: null,
      workspacePath: workspace,
      error: err.message,
      previousStillRunning,
      logs
    };
  }
}

async function startApplication(app) {
  if (isMockRunner()) throw new Error('Mock runner cannot start real processes');
  const workspace = getWorkspacePath(app);
  if (!fs.existsSync(workspace)) {
    throw new Error('Application workspace does not exist. Deploy the application first.');
  }
  const db = getDb();
  const row = db.prepare('SELECT runtime_pid, status FROM applications WHERE id=?').get(app.id);
  const trackedPid = Number(row?.runtime_pid || 0);
  const state = readRuntimeState(app);

  if (trackedPid && isProcessRunning(trackedPid)) {
    const markerMatches = state
      && Number(state.pid) === trackedPid
      && Number(state.appId) === Number(app.id);
    if (markerMatches) {
      return { alreadyRunning: true, pid: trackedPid };
    }
    throw new Error(
      `Refusing to start: tracked PID ${trackedPid} does not match this application's runtime marker. ` +
      'Stop the application to clear the stale PID, then retry.'
    );
  }

  if (trackedPid) {
    // The recorded process is gone. Clear the stale PID before starting so a
    // failed health check cannot leave the row pointing at a reused PID.
    db.prepare("UPDATE applications SET runtime_pid=NULL, status='stopped' WHERE id=?").run(app.id);
  }

  const result = await startAndTrack(app, workspace);
  return { alreadyRunning: false, ...result };
}

async function stopApplication(app) {
  if (isMockRunner()) throw new Error('Mock runner cannot stop real processes');
  return stopTrackedProcess(app, { updateStatus: true });
}

async function restartApplication(app) {
  if (isMockRunner()) throw new Error('Mock runner cannot restart real processes');
  await stopApplication(app);
  return startApplication(app);
}

/**
 * Check out a previously deployed commit and rebuild/restart.
 */
async function rollbackToCommit(app, commitHash) {
  if (isMockRunner()) {
    return { success: true, mock: true };
  }
  if (!/^[a-f0-9]{7,40}$/i.test(String(commitHash || ''))) {
    throw new Error(`Invalid rollback commit: ${commitHash}`);
  }
  const workspace = getWorkspacePath(app);
  if (!fs.existsSync(path.join(workspace, '.git'))) {
    throw new Error('Application workspace has no Git repository to roll back');
  }
  const logs = [`Rolling back to ${commitHash}`];
  let previousStopped = false;
  try {
    try {
      await runGit(['cat-file', '-e', `${commitHash}^{commit}`], { cwd: workspace, label: 'git cat-file' });
    } catch {
      logs.push('Commit is not present locally; fetching it from origin...');
      await runGit(['fetch', '--depth', '1', 'origin', commitHash], { cwd: workspace, label: 'git fetch commit' });
    }
    await runGit(['checkout', '--force', commitHash], { cwd: workspace, label: 'git checkout commit' });
    logs.push(`Checked out ${commitHash}`);
    await installAndBuild(app, workspace, logs);
    const stopResult = await stopTrackedProcess(app, { updateStatus: false });
    if (!stopResult.stopped) {
      throw new Error(stopResult.reason || 'Could not stop the previous application process');
    }
    previousStopped = true;
    const started = await startAndTrack(app, workspace, { logs });
    return { success: true, runner: 'local', commitHash, pid: started.pid, health: started.health, logs };
  } catch (err) {
    const previousStillRunning = recordDeploymentFailure(app, err, { previousStopped, prefix: 'Rollback' });
    logs.push(`Rollback failed: ${err.message}`);
    if (previousStillRunning) {
      logs.push('The previously running version was left untouched and is still serving traffic.');
    }
    return { success: false, runner: 'local', commitHash, error: err.message, previousStillRunning, logs };
  }
}

async function destroyApplication(app) {
  try {
    const result = await stopTrackedProcess(app, { updateStatus: false });
    if (!result.stopped) {
      logger.warn({ appId: app.id, pid: result.pid, reason: result.reason }, 'Skipping workspace delete: application process is still running');
      return false;
    }
  } catch (err) {
    logger.warn({ appId: app.id, err: err.message }, 'Failed to stop application during delete');
    return false;
  }
  const workspace = getWorkspacePath(app);
  const root = getDeployDir();
  if (workspace.startsWith(root + path.sep) && fs.existsSync(workspace)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  return true;
}

function getRuntimeLogs(app, maxBytes = 51200) {
  const state = readRuntimeState(app);
  const logFile = state?.logFile || path.resolve(config.logging?.dir || './logs', `app-${Number(app.id)}.log`);
  const resolved = path.resolve(logFile);
  const allowedDir = path.resolve(config.logging?.dir || './logs');
  if (!resolved.startsWith(allowedDir + path.sep)) {
    return { logFile: null, content: 'Log path is outside the configured log directory.' };
  }
  if (!fs.existsSync(resolved)) return { logFile: resolved, content: '' };
  const stat = fs.statSync(resolved);
  const length = Math.min(stat.size, maxBytes);
  const start = Math.max(0, stat.size - length);
  const fd = fs.openSync(resolved, 'r');
  const buffer = Buffer.alloc(length);
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  return { logFile: resolved, content: buffer.toString('utf8') };
}

async function stopAll() {
  if (isMockRunner()) return;
  let rows = [];
  try {
    rows = getDb().prepare('SELECT * FROM applications WHERE runtime_pid IS NOT NULL').all();
  } catch {
    return;
  }
  for (const app of rows) {
    try {
      await stopTrackedProcess(app, { updateStatus: true });
    } catch (err) {
      logger.warn({ appId: app.id, err: err.message }, 'Failed to stop application on shutdown');
    }
  }
}

module.exports = {
  DEFAULT_APP_PORT,
  getRunnerType,
  isMockRunner,
  getDeployDir,
  getWorkspacePath,
  assertUsableAppPort,
  checkPortAvailable,
  assertSafeGitUrl,
  assertSafeBranch,
  assertSafeCommand,
  parseEnvVars,
  buildProcessEnv,
  resolveInstallCommand,
  resolveStartCommand,
  isProcessRunning,
  isAppProcessRunning,
  deployApplication,
  startApplication,
  stopApplication,
  restartApplication,
  rollbackToCommit,
  destroyApplication,
  getRuntimeLogs,
  stopAll
};
