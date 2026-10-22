'use strict';
const{alert,recovered,getDiskUsagePercent,getMemoryUsagePercent}=require('../monitoring/alerts');
const{getDb}=require('../../database/database');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
const states={disk:false,memory:false,database:false};
async function runHealthChecks(){
  try{const d=getDiskUsagePercent('/');if(d>=config.health.alertDiskPercent){if(!states.disk){states.disk=true;await alert('disk',`🚨 <b>ALERT: High disk usage</b>\n\nDisk: ${d}%`);}}else if(states.disk){states.disk=false;await recovered('disk',`✅ <b>RECOVERED: Disk usage normal</b>\n\nDisk: ${d}%`);}}catch(err){logger.error({err:err.message},'Disk check failed');}
  try{const m=getMemoryUsagePercent();if(m>=config.health.alertMemoryPercent){if(!states.memory){states.memory=true;await alert('memory',`🚨 <b>ALERT: High memory usage</b>\n\nMemory: ${m}%`);}}else if(states.memory){states.memory=false;await recovered('memory',`✅ <b>RECOVERED: Memory normal</b>\n\nMemory: ${m}%`);}}catch(err){logger.error({err:err.message},'Memory check failed');}
  try{getDb().prepare('SELECT 1').get();if(states.database){states.database=false;await recovered('database','✅ <b>RECOVERED: Database accessible</b>');}}catch(err){if(!states.database){states.database=true;await alert('database',`🚨 <b>ALERT: Database error</b>\n\n${err.message}`);}}
  try{const { refreshAllNodesTelemetry } = require('../services/nodeManagerService'); await refreshAllNodesTelemetry();}catch(err){logger.warn({err:err.message},'Scheduled node telemetry refresh failed');}
}
module.exports={runHealthChecks};
