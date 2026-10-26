'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';

const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../config/config');
const runner = require('../../src/services/appRunnerService');

let tempRoot;
let deployDir;
let logDir;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'commandor-runner-test-'));
  deployDir = path.join(tempRoot, 'apps');
  logDir = path.join(tempRoot, 'logs');
  fs.mkdirSync(deployDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  config.apps.deployDir = deployDir;
  config.logging.dir = logDir;
});

afterAll(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
});

describe('Local application runner helpers', () => {
  test('defaults to the simulated runner under NODE_ENV=test', () => {
    expect(runner.getRunnerType()).toBe('mock');
    expect(runner.isMockRunner()).toBe(true);
  });

  test('accepts safe Git remotes and rejects local or ambiguous ones', () => {
    expect(runner.assertSafeGitUrl('https://github.com/org/repo.git')).toBe('https://github.com/org/repo.git');
    expect(runner.assertSafeGitUrl('ssh://git@github.com/org/repo.git')).toBe('ssh://git@github.com/org/repo.git');
    expect(runner.assertSafeGitUrl('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git');

    expect(() => runner.assertSafeGitUrl('')).toThrow(/valid Git repository URL/i);
    expect(() => runner.assertSafeGitUrl('file:///etc/passwd')).toThrow(/Unsupported Git URL protocol/i);
    expect(() => runner.assertSafeGitUrl('--upload-pack=evil')).toThrow(/start with a dash/i);
    expect(() => runner.assertSafeGitUrl('https://github.com/org/repo.git --upload-pack=evil')).toThrow(/whitespace/i);
    expect(() => runner.assertSafeGitUrl('relative/path')).toThrow(/absolute/i);
  });

  test('validates branches without allowing option or revision injection', () => {
    expect(runner.assertSafeBranch('main')).toBe('main');
    expect(runner.assertSafeBranch('feature/local-auth')).toBe('feature/local-auth');
    expect(runner.assertSafeBranch('release-1.2.3')).toBe('release-1.2.3');

    expect(() => runner.assertSafeBranch('')).toThrow(/required/i);
    expect(() => runner.assertSafeBranch('-main')).toThrow(/invalid characters/i);
    expect(() => runner.assertSafeBranch('../main')).toThrow(/invalid characters/i);
    expect(() => runner.assertSafeBranch('main..release')).toThrow(/invalid characters/i);
    expect(() => runner.assertSafeBranch('feature//x')).toThrow(/invalid characters/i);
    expect(() => runner.assertSafeBranch('feature branch')).toThrow(/invalid characters/i);
    expect(() => runner.assertSafeBranch('main:evil')).toThrow(/invalid characters/i);
  });

  test('validates single-line start and build commands', () => {
    expect(runner.assertSafeCommand('  npm start  ', 'Start command')).toBe('npm start');
    expect(() => runner.assertSafeCommand('', 'Start command')).toThrow(/non-empty/i);
    expect(() => runner.assertSafeCommand('npm start\nrm -rf /', 'Start command')).toThrow(/single line/i);
    expect(() => runner.assertSafeCommand('npm start\r\nwhoami', 'Start command')).toThrow(/single line/i);
    expect(() => runner.assertSafeCommand('x'.repeat(4001), 'Start command')).toThrow(/too long/i);
  });

  test('parses environment variables from JSON objects safely', () => {
    expect(runner.parseEnvVars({ env_vars: '{"API_KEY":"abc","PORT":8080,"DEBUG":true,"EMPTY":null}' })).toEqual({
      API_KEY: 'abc',
      PORT: '8080',
      DEBUG: 'true',
      EMPTY: ''
    });

    expect(() => runner.parseEnvVars({ env_vars: 'not-json' })).toThrow(/valid JSON/i);
    expect(() => runner.parseEnvVars({ env_vars: '["a"]' })).toThrow(/JSON object/i);
    expect(() => runner.parseEnvVars({ env_vars: '{"bad-key":"x"}' })).toThrow(/Invalid environment variable name/i);
    expect(() => runner.parseEnvVars({ env_vars: '{"OBJECT":{"nested":true}}' })).toThrow(/must be a string, number or boolean/i);
  });

  test('does not leak server secrets into application processes', () => {
    process.env.SESSION_SECRET = 'server-session-secret';
    process.env.ENCRYPTION_KEY = 'server-encryption-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'server-bot-token';

    const env = runner.buildProcessEnv({
      id: 1,
      name: 'env-demo',
      port: 4321,
      env_vars: '{"API_KEY":"abc","NODE_ENV":"staging"}'
    });

    expect(env.API_KEY).toBe('abc');
    expect(env.NODE_ENV).toBe('staging');
    expect(env.PORT).toBe('4321');
    expect(env.COMMANDOR_APPLICATION).toBe('env-demo');
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.ENCRYPTION_KEY).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.PATH || env.Path).toBeTruthy();

    const defaults = runner.buildProcessEnv({ id: 2, name: 'env-defaults', port: 4322 });
    expect(defaults.NODE_ENV).toBe('production');
  });

  test('resolves workspaces inside the configured deploy directory only', () => {
    expect(runner.getWorkspacePath({ name: 'Demo-App' })).toBe(path.join(deployDir, 'demo-app'));
    expect(() => runner.getWorkspacePath({ name: '../escape' })).toThrow(/unsafe characters/i);
    expect(() => runner.getWorkspacePath({ name: 'a' })).toThrow(/unsafe characters/i);
    expect(() => runner.getWorkspacePath({ name: 'bad name' })).toThrow(/unsafe characters/i);
  });

  test('chooses install commands from lockfiles and ecosystem markers', () => {
    const workspace = fs.mkdtempSync(path.join(tempRoot, 'install-'));
    const logs = [];

    expect(runner.resolveInstallCommand(workspace, logs)).toBeNull();

    fs.writeFileSync(path.join(workspace, 'requirements.txt'), 'flask\n');
    expect(runner.resolveInstallCommand(workspace, logs)).toBe('python -m pip install -r requirements.txt');
    fs.unlinkSync(path.join(workspace, 'requirements.txt'));

    fs.writeFileSync(path.join(workspace, 'go.mod'), 'module example.com/app\n');
    expect(runner.resolveInstallCommand(workspace, logs)).toBeNull();
    expect(logs.join(' ')).toMatch(/Go module detected/i);
    fs.unlinkSync(path.join(workspace, 'go.mod'));

    fs.writeFileSync(path.join(workspace, 'package.json'), '{"name":"demo"}\n');
    expect(runner.resolveInstallCommand(workspace, logs)).toBe('npm install --no-audit --no-fund');

    fs.writeFileSync(path.join(workspace, 'yarn.lock'), '');
    expect(runner.resolveInstallCommand(workspace, logs)).toBe('corepack yarn install --frozen-lockfile');

    fs.writeFileSync(path.join(workspace, 'pnpm-lock.yaml'), '');
    expect(runner.resolveInstallCommand(workspace, logs)).toBe('corepack pnpm install --frozen-lockfile');

    fs.writeFileSync(path.join(workspace, 'package-lock.json'), '{}');
    expect(runner.resolveInstallCommand(workspace, logs)).toBe('npm ci --no-audit --no-fund');
  });

  test('resolves start commands from settings, package scripts and entry files', () => {
    const workspace = fs.mkdtempSync(path.join(tempRoot, 'start-'));

    expect(runner.resolveStartCommand({ start_command: 'node custom.js' }, workspace)).toBe('node custom.js');
    expect(runner.resolveStartCommand({}, workspace)).toBeNull();

    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));
    expect(runner.resolveStartCommand({}, workspace)).toBe('npm start');

    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { serve: 'vite preview' } }));
    expect(runner.resolveStartCommand({}, workspace)).toBe('npm run serve');

    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ main: 'app.js' }));
    expect(runner.resolveStartCommand({}, workspace)).toBe('node "app.js"');

    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ main: '../escape.js' }));
    fs.writeFileSync(path.join(workspace, 'server.js'), 'console.log("ok")');
    expect(runner.resolveStartCommand({}, workspace)).toBe('node server.js');
  });

  test('reads runtime logs only from the configured log directory', () => {
    const workspace = runner.getWorkspacePath({ name: 'demo-app' });
    fs.mkdirSync(workspace, { recursive: true });
    const allowedLog = path.join(logDir, 'app-1.log');
    fs.writeFileSync(allowedLog, 'hello from the app\n');
    fs.writeFileSync(path.join(workspace, '.commandor-runtime.json'), JSON.stringify({ logFile: allowedLog }));

    expect(runner.getRuntimeLogs({ id: 1, name: 'demo-app' })).toMatchObject({
      logFile: allowedLog,
      content: 'hello from the app\n'
    });

    const outsideLog = path.join(tempRoot, 'outside.log');
    fs.writeFileSync(outsideLog, 'secret');
    fs.writeFileSync(path.join(workspace, '.commandor-runtime.json'), JSON.stringify({ logFile: outsideLog }));
    const blocked = runner.getRuntimeLogs({ id: 1, name: 'demo-app' });
    expect(blocked.logFile).toBeNull();
    expect(blocked.content).toMatch(/outside the configured log directory/i);
  });

  test('does not report the current process as a supervised app process', () => {
    expect(runner.isProcessRunning(process.pid)).toBe(false);
    expect(runner.isProcessRunning('nope')).toBe(false);
    expect(runner.isProcessRunning(0)).toBe(false);
  });

  test('rejects reserved application ports and detects an occupied port', async () => {
    expect(runner.DEFAULT_APP_PORT).toBe(8080);
    expect(runner.assertUsableAppPort(8080)).toBe(8080);
    expect(() => runner.assertUsableAppPort(80)).toThrow(/reserved/i);
    expect(() => runner.assertUsableAppPort(443)).toThrow(/reserved/i);
    expect(() => runner.assertUsableAppPort(config.server.port)).toThrow(/reserved/i);
    expect(() => runner.assertUsableAppPort(config.server.webPort)).toThrow(/reserved/i);
    expect(() => runner.assertUsableAppPort(70000)).toThrow(/between 1 and 65535/i);

    const net = require('net');
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    try {
      const occupied = await runner.checkPortAvailable(port, '127.0.0.1');
      expect(occupied.available).toBe(false);
      expect(occupied.error).toMatch(/already in use/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    const free = await runner.checkPortAvailable(port, '127.0.0.1');
    expect(free.available).toBe(true);
  });
});
