'use strict';
const{getDb}=require('../../database/database');
const{deliverWebhook}=require('../services/webhookService');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
async function retryFailedWebhooks(){
  const db=getDb();
  const failed=db.prepare('SELECT wd.*,w.url,w.secret FROM webhook_deliveries wd JOIN webhooks w ON wd.webhook_id=w.id WHERE wd.status=? AND wd.attempt_number<? AND(wd.next_retry_at IS NULL OR wd.next_retry_at<=datetime(\'now\')) AND w.enabled=1 LIMIT 50').all('failed',config.webhooks.retryLimit);
  for(const d of failed){const delay=config.webhooks.retryBaseDelayMs*Math.pow(2,d.attempt_number-1);const next=new Date(Date.now()+delay).toISOString();try{const ok=await deliverWebhook({id:d.webhook_id,url:d.url,secret:d.secret},d.event_type,{});if(!ok){const na=d.attempt_number+1;const ns=na>=config.webhooks.retryLimit?'dead':'failed';db.prepare('UPDATE webhook_deliveries SET attempt_number=?,status=?,next_retry_at=? WHERE id=?').run(na,ns,next,d.id);}}catch(err){logger.error({err:err.message,deliveryId:d.id},'Webhook retry error');}}
}
module.exports={retryFailedWebhooks};
