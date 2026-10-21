'use strict';
const{getDb}=require('../../database/database');
const{createAlias}=require('../services/aliasService');
const{checkAliasQuota}=require('../services/quotaService');
const logger=require('../monitoring/logger');
const cron=require('node-cron');
function setupScheduledAliasJobs(){
  cron.schedule('* * * * *',async()=>{
    const db=getDb();
    const jobs=db.prepare("SELECT * FROM scheduled_alias_jobs WHERE enabled=1 AND(next_run_at IS NULL OR next_run_at<=datetime('now'))").all();
    for(const job of jobs){try{if(!cron.validate(job.cron_expression))continue;const q=checkAliasQuota(job.tg_id);if(!q.canCreate){logger.warn({tgId:job.tg_id},'Scheduled alias skipped: quota exceeded');continue;}await createAlias({tgId:job.tg_id,domain:job.domain,type:job.alias_type});logger.info({jobId:job.id,tgId:job.tg_id},'Scheduled alias created');const next=new Date(Date.now()+60000).toISOString();db.prepare("UPDATE scheduled_alias_jobs SET last_run_at=datetime('now'),next_run_at=?,run_count=run_count+1 WHERE id=?").run(next,job.id);}catch(err){logger.error({err:err.message,jobId:job.id},'Scheduled alias job failed');}}
  });
}
module.exports={setupScheduledAliasJobs};
