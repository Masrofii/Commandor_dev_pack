'use strict';
require('dotenv').config();
function optional(k,d){return process.env[k]!==undefined?process.env[k]:d;}
function optionalInt(k,d){const v=process.env[k];return v!==undefined?parseInt(v,10):d;}
function optionalBool(k,d=false){const v=process.env[k];return v===undefined?d:(v==='true'||v==='1');}
const config={
  isDevelopment:optional('NODE_ENV','production')==='development',
  isProduction:optional('NODE_ENV','production')==='production',
  server:{port:optionalInt('PORT',3000),webPort:optionalInt('WEB_PORT',3001),webUrl:optional('WEB_URL','http://localhost:3001'),corsOrigins:optional('CORS_ORIGINS','http://localhost:3001').split(',').map(s=>s.trim())},
  database:{path:optional('DATABASE_PATH','./data/app.db')},
  telegram:{token:optional('TELEGRAM_BOT_TOKEN',''),adminId:optionalInt('ADMIN_TELEGRAM_ID',0)},
  incoming:{secret:optional('INCOMING_SECRET','')},
  domains:{list:optional('DOMAINS','').split(',').map(d=>d.trim()).filter(Boolean),defaultDomain:optional('DEFAULT_DOMAIN','')},
  quotas:{maxAliases:optionalInt('MAX_ALIASES',5),maxStorageBytes:optionalInt('MAX_STORAGE_BYTES',104857600),maxEmailSize:optionalInt('MAX_EMAIL_SIZE',10485760),maxAttachmentSize:optionalInt('MAX_ATTACHMENT_SIZE',5242880),maxWebhooks:optionalInt('MAX_WEBHOOKS',5),maxApiKeys:optionalInt('MAX_API_KEYS',10),emailTtlDays:optionalInt('EMAIL_TTL_DAYS',7),aliasTtlDays:optionalInt('ALIAS_TTL_DAYS',30),burnerTtlMinutes:optionalInt('BURNER_TTL_MINUTES',60)},
  storage:{driver:optional('STORAGE_DRIVER','local'),uploadDir:optional('UPLOAD_DIR','./uploads'),r2:{accountId:optional('R2_ACCOUNT_ID'),accessKeyId:optional('R2_ACCESS_KEY_ID'),secretAccessKey:optional('R2_SECRET_ACCESS_KEY'),bucket:optional('R2_BUCKET'),endpoint:optional('R2_ENDPOINT')}},
  smtp:{host:optional('SMTP_HOST'),port:optionalInt('SMTP_PORT',587),secure:optionalBool('SMTP_SECURE'),user:optional('SMTP_USER'),pass:optional('SMTP_PASS'),from:optional('SMTP_FROM','noreply@localhost')},
  session:{secret:optional('SESSION_SECRET','change-me-in-production'),ttlHours:optionalInt('SESSION_TTL_HOURS',168)},
  jwt:{secret:optional('JWT_SECRET','change-me-in-production')},
  admin2fa:{issuer:optional('ADMIN_2FA_ISSUER','CommandorDevPack')},
  geoip:{enabled:optionalBool('GEOIP_ENABLED'),dbPath:optional('GEOIP_DATABASE_PATH','./data/GeoLite2-City.mmdb')},
  webhooks:{retryLimit:optionalInt('WEBHOOK_RETRY_LIMIT',5),retryBaseDelayMs:optionalInt('WEBHOOK_RETRY_BASE_DELAY_MS',5000)},
  logging:{level:optional('LOG_LEVEL','info'),dir:optional('LOG_DIR','./logs')},
  backup:{dir:optional('BACKUP_DIR','./backups'),retentionDaily:optionalInt('BACKUP_RETENTION_DAILY',7),retentionWeekly:optionalInt('BACKUP_RETENTION_WEEKLY',4)},
  health:{alertDiskPercent:optionalInt('HEALTH_ALERT_DISK_PERCENT',90),alertMemoryPercent:optionalInt('HEALTH_ALERT_MEMORY_PERCENT',90),discordWebhook:optional('DISCORD_ALERT_WEBHOOK')},
  spam:{thresholdScore:optionalInt('SPAM_THRESHOLD_SCORE',5),blockScore:optionalInt('SPAM_BLOCK_SCORE',8)},
  clamav:{enabled:optionalBool('CLAMAV_ENABLED'),host:optional('CLAMAV_HOST','127.0.0.1'),port:optionalInt('CLAMAV_PORT',3310)},
};
function validate(){
  const errors=[];
  if(config.isProduction){
    if(!config.telegram.token)errors.push('TELEGRAM_BOT_TOKEN is required');
    if(!config.incoming.secret)errors.push('INCOMING_SECRET is required');
    if(!config.domains.list.length)errors.push('DOMAINS is required');
    if(config.session.secret==='change-me-in-production')errors.push('SESSION_SECRET must be changed');
    if(config.jwt.secret==='change-me-in-production')errors.push('JWT_SECRET must be changed');
  }
  if(errors.length)throw new Error('Configuration errors:\n'+errors.join('\n'));
}
module.exports=config;
module.exports.validate=validate;
