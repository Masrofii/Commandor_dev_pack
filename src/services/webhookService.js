'use strict';
const{getDb}=require('../../database/database');
const{hmacSign}=require('../utils/crypto');
const axios=require('axios');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
const crypto=require('crypto');
function getUserWebhooks(tgId){return getDb().prepare('SELECT * FROM webhooks WHERE tg_id=? ORDER BY created_at DESC').all(tgId);}
function getWebhookById(id,tgId){return getDb().prepare('SELECT * FROM webhooks WHERE id=? AND tg_id=?').get(id,tgId);}
function createWebhook({tgId,name,url,secret,eventTypes}){const db=getDb();const c=db.prepare('SELECT COUNT(*)as c FROM webhooks WHERE tg_id=?').get(tgId).c;if(c>=config.quotas.maxWebhooks)throw new Error('Webhook limit reached');const r=db.prepare('INSERT INTO webhooks(tg_id,name,url,secret,event_types)VALUES(?,?,?,?,?)').run(tgId,name,url,secret||null,JSON.stringify(eventTypes||['email.received']));return db.prepare('SELECT * FROM webhooks WHERE id=?').get(r.lastInsertRowid);}
function deleteWebhook(id,tgId){return getDb().prepare('DELETE FROM webhooks WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
async function deliverWebhook(webhook,event,payload){
  const db=getDb();const body=JSON.stringify({event,payload,timestamp:new Date().toISOString()});
  const did=db.prepare("INSERT INTO webhook_deliveries(webhook_id,email_id,event_type,payload_hash,status)VALUES(?,?,?,?,'pending')").run(webhook.id,payload.emailId||null,event,crypto.createHash('md5').update(body).digest('hex')).lastInsertRowid;
  const headers={'Content-Type':'application/json','X-Webhook-Event':event,'X-Delivery-Id':did.toString(),'X-Timestamp':Date.now().toString()};
  if(webhook.secret)headers['X-Webhook-Signature']=`sha256=${hmacSign(webhook.secret,body)}`;
  const start=Date.now();
  try{const resp=await axios.post(webhook.url,body,{headers,timeout:15000,validateStatus:()=>true});const dur=Date.now()-start;const ok=resp.status>=200&&resp.status<300;db.prepare("UPDATE webhook_deliveries SET status=?,http_status=?,response_time_ms=?,completed_at=datetime('now')WHERE id=?").run(ok?'delivered':'failed',resp.status,dur,did);return ok;}
  catch(err){db.prepare("UPDATE webhook_deliveries SET status='failed',error=?,response_time_ms=?,completed_at=datetime('now')WHERE id=?").run(err.message,Date.now()-start,did);return false;}
}
async function dispatchWebhooks(tgId,event,payload){const whs=getDb().prepare('SELECT * FROM webhooks WHERE tg_id=? AND enabled=1 AND event_types LIKE ?').all(tgId,`%${event}%`);for(const wh of whs)deliverWebhook(wh,event,payload).catch(()=>{});}
module.exports={getUserWebhooks,getWebhookById,createWebhook,deleteWebhook,deliverWebhook,dispatchWebhooks};
