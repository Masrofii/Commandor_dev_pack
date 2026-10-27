'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

const SCRIPT = `
const config = require('./config/config');
try {
  const result = config.validate();
  console.log(JSON.stringify({
    ok: true,
    warnings: result.warnings,
    runner: config.apps.runner,
    localAuthEnabled: config.localAuth.enabled,
    allowPrivateOutbound: config.security.allowPrivateOutbound,
    allowUserDeployments: config.apps.allowUserDeployments
  }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err.message }));
}
`;

function loadConfig(overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    'NODE_ENV', 'SESSION_SECRET', 'JWT_SECRET', 'ENCRYPTION_KEY',
    'TELEGRAM_BOT_TOKEN', 'LOCAL_AUTH_ENABLED', 'LOCAL_ADMIN_PASSWORD',
    'DOMAINS', 'DEFAULT_DOMAIN', 'INCOMING_SECRET', 'APP_RUNNER',
    'APP_ALLOW_USER_DEPLOYMENTS', 'ALLOW_PRIVATE_OUTBOUND', 'DOTENV_CONFIG_PATH'
  ]) {
    delete env[key];
  }
  env.DOTENV_CONFIG_PATH = process.platform === 'win32' ? 'NUL' : '/dev/null';
  Object.assign(env, overrides);

  const result = spawnSync(process.execPath, ['-e', SCRIPT], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: 30000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Config probe failed: ${result.stderr || result.stdout}`);
  }
  try {
    return JSON.parse(result.stdout.trim().split(/\r?\n/).pop());
  } catch {
    throw new Error(`Unexpected config probe output: ${result.stdout}`);
  }
}

describe('Configuration validation', () => {
  test('production requires unique secrets, encryption and a login method', () => {
    const result = loadConfig({ NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/SESSION_SECRET/);
    expect(result.error).toMatch(/JWT_SECRET/);
    expect(result.error).toMatch(/ENCRYPTION_KEY/);
    expect(result.error).toMatch(/TELEGRAM_BOT_TOKEN or LOCAL_ADMIN_PASSWORD/);
  });

  test('production accepts a complete configuration and reports operational warnings', () => {
    const result = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-unique-session-secret',
      JWT_SECRET: 'a-unique-jwt-secret',
      ENCRYPTION_KEY: 'a-32-character-encryption-key-123',
      LOCAL_ADMIN_PASSWORD: 'a-strong-local-password',
      LOCAL_AUTH_ENABLED: 'true',
      DOMAINS: 'example.com',
      DEFAULT_DOMAIN: 'example.com',
      APP_RUNNER: 'local',
      APP_ALLOW_USER_DEPLOYMENTS: 'true'
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.join('\n')).toMatch(/APP_RUNNER=local/i);
    expect(result.warnings.join('\n')).toMatch(/APP_ALLOW_USER_DEPLOYMENTS=true/i);
    expect(result.allowUserDeployments).toBe(true);
  });

  test('rejects a short encryption key', () => {
    const result = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-unique-session-secret',
      JWT_SECRET: 'a-unique-jwt-secret',
      ENCRYPTION_KEY: 'short',
      TELEGRAM_BOT_TOKEN: 'test-token'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 16 characters/i);
  });

  test('test mode defaults to the mock runner and private outbound blocking', () => {
    const result = loadConfig({ NODE_ENV: 'test' });
    expect(result.ok).toBe(true);
    expect(result.runner).toBe('mock');
    expect(result.localAuthEnabled).toBe(true);
    expect(result.allowPrivateOutbound).toBe(false);
    expect(result.allowUserDeployments).toBe(false);
  });
});
