'use strict';
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');
const config = require('./config/config');
const { initDatabase, runMigrations, closeDatabase } = require('./database/database');
const logger = require('./src/monitoring/logger');
const { applySecurity } = require('./src/middleware/security');
const requestId = require('./src/middleware/requestId');
const errorHandler = require('./src/middleware/errorHandler');
const { defaultLimiter } = require('./src/middleware/rateLimit');
const wsManager = require('./src/realtime/websocket');
const { setBotInstance, setWsServer } = require('./src/services/notificationService');
const { setAuditBotInstance } = require('./src/services/auditLogger');
const { createBot, startBot } = require('./src/bot/bot');
const { ensureLocalAdmin } = require('./src/services/localAuthService');
const { stopAll: stopAllApps } = require('./src/services/appRunnerService');
const { runCleanup } = require('./src/jobs/cleanup');
const { runBackup } = require('./src/jobs/backups');
const { runHealthChecks } = require('./src/jobs/healthChecks');
const { retryFailedWebhooks } = require('./src/jobs/webhookRetry');
const { setupScheduledAliasJobs } = require('./src/jobs/scheduledAliases');

const REQUIRED_DIRS = [
  './data',
  config.storage.uploadDir,
  config.backup.dir,
  config.logging.dir,
  './exports',
  config.apps.deployDir
];

for (const dir of REQUIRED_DIRS) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function startServer() {
  try {
    const validation = config.validate();
    for (const warning of validation?.warnings || []) {
      logger.warn({ warning }, 'Configuration warning');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Configuration validation failed');
    process.exit(1);
  }

  initDatabase();
  runMigrations();

  if (config.localAuth.enabled && config.localAuth.password) {
    try {
      await ensureLocalAdmin();
    } catch (err) {
      // Telegram login can still be used when local bootstrap fails, so keep
      // the server running but make the failure highly visible.
      logger.error({ err: err.message }, 'Failed to bootstrap local administrator account');
    }
  }

  const app = express();
  app.set('trust proxy', config.server.trustProxy);

  applySecurity(app);
  app.use(compression());
  app.use(requestId);
  if (config.isDevelopment) app.use(morgan('dev'));

  const { subdomainWebMiddleware } = require('./src/api/subdomainWebRouter');
  app.use(subdomainWebMiddleware);

  // Incoming email has its own high-volume limiter and must not be throttled by
  // the general dashboard/API limiter.
  app.use('/api/incoming', require('./src/api/incoming'));
  app.use('/api', defaultLimiter);

  app.use('/api/subdomains', require('./src/api/subdomains'));
  app.use('/api/hosting', require('./src/api/hosting'));
  app.use('/api/applications', require('./src/api/applications'));
  app.use('/api/launchpad', require('./src/api/launchpad'));
  app.use('/api/templates', require('./src/api/templates'));
  app.use('/api/monitoring', require('./src/api/monitoring'));
  app.use('/api/backups', require('./src/api/backups'));
  app.use('/api/aliases', require('./src/api/aliases'));
  app.use('/api/emails', require('./src/api/emails'));
  app.use('/api/attachments', require('./src/api/attachments'));
  app.use('/api/replies', require('./src/api/replies'));
  app.use('/api/webhooks', require('./src/api/webhooks'));
  app.use('/api/sessions', require('./src/api/sessions'));
  app.use('/api/api-keys', require('./src/api/apiKeys'));
  app.use('/api/contacts', require('./src/api/contacts'));
  app.use('/api/domains', require('./src/api/domains'));
  app.use('/api/export', require('./src/api/export'));
  app.use('/api/automations', require('./src/api/automations'));
  app.use('/api/forwarding', require('./src/api/forwarding'));
  app.use('/api/subscription', require('./src/api/subscriptions'));
  app.use('/api/admin', require('./src/api/admin'));
  app.use('/api/auth/telegram', require('./src/auth/webAuth'));
  app.use('/api/auth', require('./src/api/auth'));
  app.post('/api/auth/logout', require('./src/middleware/auth').requireAuth, (req, res) => {
    require('./src/auth/sessions').revokeSession(req.user.id, req.tgId);
    res.json({ status: 'logged out' });
  });
  app.use('/', require('./src/api/health'));
  app.use('/api', require('./src/api/health'));
  app.use(errorHandler);

  const server = http.createServer(app);
  wsManager.attach(server);
  setWsServer(wsManager);

  const bot = createBot();
  if (bot) {
    setBotInstance(bot);
    setAuditBotInstance(bot);
    startBot(bot);
  }

  cron.schedule('0 2 * * *', () => runCleanup().catch(err => logger.error({ err: err.message }, 'Cleanup failed')));
  cron.schedule('0 3 * * *', () => runBackup().catch(err => logger.error({ err: err.message }, 'Backup failed')));
  cron.schedule('*/5 * * * *', () => runHealthChecks().catch(() => {}));
  cron.schedule('*/2 * * * *', () => retryFailedWebhooks().catch(() => {}));
  setupScheduledAliasJobs();

  server.listen(config.server.port, () => {
    logger.info({ port: config.server.port, env: process.env.NODE_ENV, runner: config.apps.runner }, 'Server started');
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown initiated');
    server.close(() => logger.info('HTTP server closed'));
    if (bot) {
      try { bot.stop(signal); } catch {}
    }
    wsManager.wss?.close();
    try { await stopAllApps(); } catch (err) { logger.warn({ err: err.message }, 'Failed to stop application processes'); }
    closeDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', err => {
    logger.error({ err: err.message, stack: err.stack }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', err => {
    logger.error({ err: err?.message }, 'Unhandled rejection');
  });

  return server;
}

startServer().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
