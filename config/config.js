'use strict';
require('dotenv').config();

const os = require('os');
const pkg = require('../package.json');

function optional(key, fallback) {
  return process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : fallback;
}
function optionalInt(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function optionalBool(key, fallback = false) {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}
function optionalList(key, fallback = []) {
  const value = optional(key, '');
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const nodeEnv = optional('NODE_ENV', 'production');
const isTest = nodeEnv === 'test';

function detectPublicIp() {
  const configured = optional('SERVER_PUBLIC_IP', '');
  if (configured) return configured;
  if (isTest) return '127.0.0.1';
  try {
    const interfaces = os.networkInterfaces();
    for (const addresses of Object.values(interfaces)) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) return address.address;
      }
    }
  } catch {
    // Ignore interface detection failures and fall back to loopback.
  }
  return '127.0.0.1';
}

const config = {
  app: {
    name: 'Commandor Dev Pack',
    version: pkg.version,
    nodeEnv,
    isTest
  },
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  isTest,
  server: {
    port: optionalInt('PORT', 3000),
    webPort: optionalInt('WEB_PORT', 3001),
    baseUrl: optional('BASE_URL', 'http://localhost:3000'),
    webUrl: optional('WEB_URL', 'http://localhost:3001'),
    publicIp: detectPublicIp(),
    trustProxy: optionalInt('TRUST_PROXY', 1),
    corsOrigins: optionalList('CORS_ORIGINS', ['http://localhost:3001', 'http://localhost:3000'])
  },
  database: { path: optional('DATABASE_PATH', './data/app.db') },
  telegram: {
    token: optional('TELEGRAM_BOT_TOKEN', ''),
    adminId: optionalInt('ADMIN_TELEGRAM_ID', 0),
    botUsername: optional('TELEGRAM_BOT_USERNAME', 'CommandorDevBot'),
    ownerUsername: optional('OWNER_USERNAME', 'xpT_T')
  },
  localAuth: {
    enabled: optionalBool('LOCAL_AUTH_ENABLED', true),
    username: optional('LOCAL_ADMIN_USERNAME', 'admin'),
    password: optional('LOCAL_ADMIN_PASSWORD', ''),
    tgId: optionalInt('LOCAL_ADMIN_TG_ID', 900000001)
  },
  incoming: { secret: optional('INCOMING_SECRET', '') },
  domains: {
    list: optionalList('DOMAINS'),
    defaultDomain: optional('DEFAULT_DOMAIN', '')
  },
  quotas: {
    maxAliases: optionalInt('MAX_ALIASES', 5),
    maxStorageBytes: optionalInt('MAX_STORAGE_BYTES', 104857600),
    maxEmailSize: optionalInt('MAX_EMAIL_SIZE', 10485760),
    maxAttachmentSize: optionalInt('MAX_ATTACHMENT_SIZE', 5242880),
    maxWebhooks: optionalInt('MAX_WEBHOOKS', 5),
    maxApiKeys: optionalInt('MAX_API_KEYS', 10),
    emailTtlDays: optionalInt('EMAIL_TTL_DAYS', 7),
    aliasTtlDays: optionalInt('ALIAS_TTL_DAYS', 30),
    burnerTtlMinutes: optionalInt('BURNER_TTL_MINUTES', 60)
  },
  storage: {
    driver: optional('STORAGE_DRIVER', 'local'),
    uploadDir: optional('UPLOAD_DIR', './uploads'),
    r2: {
      accountId: optional('R2_ACCOUNT_ID'),
      accessKeyId: optional('R2_ACCESS_KEY_ID'),
      secretAccessKey: optional('R2_SECRET_ACCESS_KEY'),
      bucket: optional('R2_BUCKET'),
      endpoint: optional('R2_ENDPOINT')
    }
  },
  smtp: {
    host: optional('SMTP_HOST'),
    port: optionalInt('SMTP_PORT', 587),
    secure: optionalBool('SMTP_SECURE'),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('SMTP_FROM', 'noreply@localhost')
  },
  session: {
    secret: optional('SESSION_SECRET', 'change-me-in-production'),
    ttlHours: optionalInt('SESSION_TTL_HOURS', 168)
  },
  jwt: { secret: optional('JWT_SECRET', 'change-me-in-production') },
  encryption: { key: optional('ENCRYPTION_KEY', '') },
  admin2fa: { issuer: optional('ADMIN_2FA_ISSUER', 'CommandorDevPack') },
  geoip: {
    enabled: optionalBool('GEOIP_ENABLED'),
    dbPath: optional('GEOIP_DATABASE_PATH', './data/GeoLite2-City.mmdb')
  },
  webhooks: {
    retryLimit: optionalInt('WEBHOOK_RETRY_LIMIT', 5),
    retryBaseDelayMs: optionalInt('WEBHOOK_RETRY_BASE_DELAY_MS', 5000)
  },
  logging: { level: optional('LOG_LEVEL', 'info'), dir: optional('LOG_DIR', './logs') },
  backup: {
    dir: optional('BACKUP_DIR', './backups'),
    retentionDays: optionalInt('BACKUP_RETENTION_DAYS', 14),
    retentionDaily: optionalInt('BACKUP_RETENTION_DAILY', 7),
    retentionWeekly: optionalInt('BACKUP_RETENTION_WEEKLY', 4)
  },
  health: {
    alertDiskPercent: optionalInt('HEALTH_ALERT_DISK_PERCENT', 90),
    alertMemoryPercent: optionalInt('HEALTH_ALERT_MEMORY_PERCENT', 90),
    discordWebhook: optional('DISCORD_ALERT_WEBHOOK')
  },
  spam: {
    thresholdScore: optionalInt('SPAM_THRESHOLD_SCORE', 5),
    blockScore: optionalInt('SPAM_BLOCK_SCORE', 8)
  },
  clamav: {
    enabled: optionalBool('CLAMAV_ENABLED'),
    host: optional('CLAMAV_HOST', '127.0.0.1'),
    port: optionalInt('CLAMAV_PORT', 3310)
  },
  proxy: {
    // "auto" validates with the system nginx when present and stores a pending
    // route when nginx is not installed (useful for local development).
    mode: optional('PROXY_MODE', 'auto')
  },
  tls: {
    // Let's Encrypt-style directory containing <domain>/fullchain.pem and
    // <domain>/privkey.pem. Managed certificates outside this layout can be
    // mounted here or provisioned separately.
    certDir: optional('TLS_CERT_DIR', '/etc/letsencrypt/live')
  },
  apps: {
    runner: optional('APP_RUNNER', isTest ? 'mock' : 'local'),
    deployDir: optional('APP_DEPLOY_DIR', './data/apps'),
    commandTimeoutMs: optionalInt('APP_COMMAND_TIMEOUT_MS', 10 * 60 * 1000),
    startTimeoutMs: optionalInt('APP_START_TIMEOUT_MS', 45000),
    // Running arbitrary build/start commands is equivalent to shell access on
    // the host. Keep it admin-only unless the operator explicitly opts in.
    allowUserDeployments: optionalBool('APP_ALLOW_USER_DEPLOYMENTS', false)
  },
  security: {
    allowPrivateOutbound: optionalBool('ALLOW_PRIVATE_OUTBOUND', false)
  }
};

function validate() {
  const errors = [];
  const warnings = [];

  if (config.session.secret === 'change-me-in-production' && config.isProduction) {
    errors.push('SESSION_SECRET must be set to a unique random value');
  }
  if (config.jwt.secret === 'change-me-in-production' && config.isProduction) {
    errors.push('JWT_SECRET must be set to a unique random value');
  }
  if (!config.encryption.key && config.isProduction) {
    errors.push('ENCRYPTION_KEY must be set (used to encrypt SSH keys, DNS tokens, and app secrets)');
  }
  if (config.encryption.key && config.encryption.key.length < 16) {
    errors.push('ENCRYPTION_KEY must be at least 16 characters long');
  }
  if (config.isProduction && !config.telegram.token && !config.localAuth.password) {
    errors.push('Configure TELEGRAM_BOT_TOKEN or LOCAL_ADMIN_PASSWORD so at least one login method is available');
  }
  if (!config.incoming.secret) {
    warnings.push('INCOMING_SECRET is not set: inbound email ingestion is disabled until it is configured');
  }
  if (!config.domains.list.length) {
    warnings.push('DOMAINS is empty: add at least one root domain to enable alias creation and subdomain routing');
  }
  if (config.apps.runner === 'local' && config.isProduction) {
    warnings.push('APP_RUNNER=local is enabled: application build/start commands execute on this host');
  }
  if (config.apps.allowUserDeployments) {
    warnings.push('APP_ALLOW_USER_DEPLOYMENTS=true: every application owner can execute build/start commands on this host');
  }
  if (!config.localAuth.password && config.localAuth.enabled) {
    warnings.push('LOCAL_ADMIN_PASSWORD is not set: local password login is unavailable');
  }
  if (config.localAuth.password && config.localAuth.password.length < 8) {
    warnings.push('LOCAL_ADMIN_PASSWORD is shorter than 8 characters; use a stronger password');
  }

  config.runtimeWarnings = warnings;
  if (errors.length) throw new Error('Configuration errors:\n- ' + errors.join('\n- '));
  return { warnings };
}

module.exports = config;
module.exports.validate = validate;
