'use strict';
require('dotenv').config();
const http=require('http');
const express=require('express');
const compression=require('compression');
const morgan=require('morgan');
const cron=require('node-cron');
const fs=require('fs');
const config=require('./config/config');
const{initDatabase,runMigrations,closeDatabase}=require('./database/database');
const logger=require('./src/monitoring/logger');
const{applySecurity}=require('./src/middleware/security');
const requestId=require('./src/middleware/requestId');
const errorHandler=require('./src/middleware/errorHandler');
const wsManager=require('./src/realtime/websocket');
const{setBotInstance,setWsServer}=require('./src/services/notificationService');
const{createBot,startBot}=require('./src/bot/bot');
const{runCleanup}=require('./src/jobs/cleanup');
const{runBackup}=require('./src/jobs/backups');
const{runHealthChecks}=require('./src/jobs/healthChecks');
const{retryFailedWebhooks}=require('./src/jobs/webhookRetry');
const{setupScheduledAliasJobs}=require('./src/jobs/scheduledAliases');

const DIRS=['./data',config.storage.uploadDir,config.backup.dir,config.logging.dir,'./exports'];
for(const d of DIRS)if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});

async function startServer(){
  try{config.validate();}catch(err){logger.error({err:err.message},'Configuration validation failed');process.exit(1);}
  initDatabase();runMigrations();
  const app=express();
  app.set('trust proxy',1);
  applySecurity(app);
  app.use(compression());
  app.use(requestId);
  if(config.isDevelopment)app.use(morgan('dev'));
  const{subdomainWebMiddleware}=require('./src/api/subdomainWebRouter');
  app.use(subdomainWebMiddleware);
  app.use('/api/incoming',require('./src/api/incoming'));
  app.use('/api/subdomains',require('./src/api/subdomains'));
  app.use('/api/hosting',require('./src/api/hosting'));
  app.use('/api/aliases',require('./src/api/aliases'));
  app.use('/api/emails',require('./src/api/emails'));
  app.use('/api/attachments',require('./src/api/attachments'));
  app.use('/api/replies',require('./src/api/replies'));
  app.use('/api/webhooks',require('./src/api/webhooks'));
  app.use('/api/sessions',require('./src/api/sessions'));
  app.use('/api/api-keys',require('./src/api/apiKeys'));
  app.use('/api/contacts',require('./src/api/contacts'));
  app.use('/api/domains',require('./src/api/domains'));
  app.use('/api/export',require('./src/api/export'));
  app.use('/api/automations',require('./src/api/automations'));
  app.use('/api/forwarding',require('./src/api/forwarding'));
  app.use('/api/admin',require('./src/api/admin'));
  app.use('/api/auth/telegram',require('./src/auth/webAuth'));
  app.use('/api/auth',require('./src/api/auth'));
  app.post('/api/auth/logout',require('./src/middleware/auth').requireAuth,(req,res)=>{require('./src/auth/sessions').revokeSession(req.user.id,req.tgId);res.json({status:'logged out'});});
  app.use('/',require('./src/api/health'));
  app.use(errorHandler);
  const server=http.createServer(app);
  wsManager.attach(server);
  setWsServer(wsManager);
  const bot=createBot();
  if(bot){setBotInstance(bot);startBot(bot);}
  cron.schedule('0 2 * * *',()=>runCleanup().catch(err=>logger.error({err:err.message},'Cleanup failed')));
  cron.schedule('0 3 * * *',()=>runBackup().catch(err=>logger.error({err:err.message},'Backup failed')));
  cron.schedule('*/5 * * * *',()=>runHealthChecks().catch(()=>{}));
  cron.schedule('*/2 * * * *',()=>retryFailedWebhooks().catch(()=>{}));
  setupScheduledAliasJobs();
  server.listen(config.server.port,()=>{logger.info({port:config.server.port,env:process.env.NODE_ENV},'Server started');});
  async function shutdown(signal){logger.info({signal},'Shutdown initiated');server.close(()=>logger.info('HTTP server closed'));if(bot)try{bot.stop(signal);}catch{}wsManager.wss?.close();closeDatabase();logger.info('Shutdown complete');process.exit(0);}
  process.on('SIGTERM',()=>shutdown('SIGTERM'));
  process.on('SIGINT',()=>shutdown('SIGINT'));
  process.on('uncaughtException',err=>{logger.error({err:err.message,stack:err.stack},'Uncaught exception');process.exit(1);});
  process.on('unhandledRejection',err=>{logger.error({err:err?.message},'Unhandled rejection');});
  return server;
}
startServer().catch(err=>{console.error('Fatal startup error:',err);process.exit(1);});
