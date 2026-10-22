'use strict';
const express=require('express');
const router=express.Router();
const{parseEmail}=require('../email/parser');
const{storeEmail}=require('../services/emailService');
const{applyFilters}=require('../email/filters');
const{shouldAutoReply,sendAutoReply}=require('../email/autoresponder');
const{forwardEmail}=require('../email/forwarding');
const{dispatchWebhooks}=require('../services/webhookService');
const{notifyNewEmail}=require('../services/notificationService');
const{recordSubdomainEmail}=require('../services/subdomainService');
const{generateIdempotencyKey,hashSha256}=require('../utils/crypto');
const{getDb}=require('../../database/database');
const{incomingEmailLimiter}=require('../middleware/rateLimit');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
const{increment}=require('../monitoring/metrics');
const crypto=require('crypto');
function validateSecret(req,res,next){const s=req.headers['x-incoming-secret']||req.headers['authorization']?.replace('Bearer ','');if(!config.incoming.secret){logger.error('INCOMING_SECRET not configured');return res.status(500).json({error:'Server configuration error'});}try{const exp=Buffer.from(config.incoming.secret);const prov=Buffer.from(s||'');if(prov.length!==exp.length||!crypto.timingSafeEqual(exp,prov)){logger.warn({ip:req.ip},'Invalid incoming secret');increment('emailsRejected');return res.status(401).json({error:'Unauthorized'});}}catch{return res.status(401).json({error:'Unauthorized'});}next();}
router.post('/',incomingEmailLimiter,validateSecret,async(req,res)=>{
  try{
    const rawEml=Buffer.isBuffer(req.body)?req.body:(typeof req.body==='string'?Buffer.from(req.body):null);
    if(!rawEml||rawEml.length===0)return res.status(400).json({error:'Empty body'});
    if(rawEml.length>config.quotas.maxEmailSize){increment('emailsRejected');return res.status(413).json({error:'Email too large'});}
    const dest=(req.headers['x-email-to']||'').toLowerCase().trim();
    if(!dest)return res.status(400).json({error:'Missing X-Email-To header'});
    const workerMeta={destination:dest,originIp:req.headers['x-origin-ip'],originHostname:req.headers['x-origin-hostname'],spf:req.headers['x-spf-result'],dkim:req.headers['x-dkim-result'],dmarc:req.headers['x-dmarc-result']};
    const contentHash=hashSha256(rawEml);const idKey=generateIdempotencyKey('incoming',dest,contentHash);
    const db=getDb();
    const existing=db.prepare('SELECT key FROM idempotency WHERE key=?').get(idKey);
    if(existing){logger.info({dest},'Duplicate email (idempotency)');return res.status(200).json({status:'duplicate'});}
    let alias=db.prepare('SELECT * FROM aliases WHERE address=? AND active=1').get(dest);
    let matchedSubdomain = null;
    if(!alias){
      const destDomain = dest.includes('@') ? dest.split('@')[1] : null;
      if (destDomain) {
        matchedSubdomain = db.prepare('SELECT * FROM subdomains WHERE full_domain=? COLLATE NOCASE AND active=1').get(destDomain);
        if (matchedSubdomain && matchedSubdomain.email_catch_all) {
          let existingAlias = db.prepare('SELECT * FROM aliases WHERE address=?').get(dest);
          if (!existingAlias) {
            db.prepare(`
              INSERT INTO aliases(address, tg_id, domain, alias_type, label, created_at, active)
              VALUES(?, ?, ?, 'subdomain_catchall', ?, datetime('now'), 1)
            `).run(dest, matchedSubdomain.tg_id, matchedSubdomain.full_domain, `Subdomain (${matchedSubdomain.subdomain})`);
            existingAlias = db.prepare('SELECT * FROM aliases WHERE address=?').get(dest);
          } else if (!existingAlias.active) {
            db.prepare('UPDATE aliases SET active=1 WHERE address=?').run(dest);
            existingAlias.active = 1;
          }
          alias = existingAlias;
          recordSubdomainEmail(matchedSubdomain.full_domain);
        }
      }
    }
    if(!alias){increment('emailsRejected');return res.status(404).json({error:'Alias not found'});}
    if(alias.expires_at&&new Date(alias.expires_at)<new Date()){db.prepare('UPDATE aliases SET active=0 WHERE address=?').run(dest);increment('emailsRejected');return res.status(410).json({error:'Alias expired'});}
    const user=db.prepare('SELECT * FROM users WHERE tg_id=?').get(alias.tg_id);
    if(!user||user.is_banned){increment('emailsRejected');return res.status(403).json({error:'User suspended'});}
    const parsedEmail=await parseEmail(rawEml);
    const filterActions=applyFilters(alias.tg_id,{sender:parsedEmail.sender,subject:parsedEmail.subject,textBody:parsedEmail.textBody,aliasAddress:dest});
    if(filterActions.some(a=>a.action==='DROP'||a.action==='BLOCK')){logger.info({dest,sender:parsedEmail.sender},'Email blocked by filter');increment('emailsRejected');db.prepare('INSERT OR IGNORE INTO idempotency(key)VALUES(?)').run(idKey);return res.status(200).json({status:'filtered'});}
    db.prepare('INSERT OR IGNORE INTO idempotency(key)VALUES(?)').run(idKey);
    let emailRecord, spamResult;
    try {
      const stored = await storeEmail({parsedEmail,rawEml,aliasRecord:alias,workerMeta});
      emailRecord = stored.emailRecord;
      spamResult = stored.spamResult;
    } catch (storeErr) {
      if (storeErr.message && (storeErr.message.includes('quota exceeded') || storeErr.message.includes('Storage backend disk'))) {
        logger.warn({ dest, tgId: alias.tg_id, err: storeErr.message }, 'Incoming email rejected due to storage quota');
        increment('emailsRejected');
        return res.status(507).json({ error: storeErr.message });
      }
      throw storeErr;
    }
    increment('emailsReceived');if(spamResult.classification==='spam')increment('spamBlocked');
    res.status(200).json({status:'accepted',emailId:emailRecord.id});
    setImmediate(async()=>{try{
      await notifyNewEmail(alias.tg_id,emailRecord,alias);
      await dispatchWebhooks(alias.tg_id,'email.received',{emailId:emailRecord.id,alias:alias.address,sender:emailRecord.sender,subject:emailRecord.subject});
      if(alias.forward_to&&alias.forward_verified)await forwardEmail(emailRecord,alias.forward_to);
      if(shouldAutoReply(alias,parsedEmail.sender))await sendAutoReply(alias,parsedEmail);
      if(matchedSubdomain?.email_webhook_url){
        fetch(matchedSubdomain.email_webhook_url,{
          method:'POST',
          headers:{'Content-Type':'application/json','User-Agent':'CommandorDevPack-Subdomain/1.0'},
          body:JSON.stringify({event:'email.received',subdomain:matchedSubdomain.subdomain,fullDomain:matchedSubdomain.full_domain,recipient:dest,sender:emailRecord.sender,subject:emailRecord.subject,textBody:emailRecord.text_body,htmlBody:emailRecord.html_body,receivedAt:emailRecord.received_at}),
          signal:AbortSignal.timeout(5000)
        }).catch(e=>logger.warn({err:e.message},'Subdomain webhook failed'));
      }
    }catch(err){logger.error({err:err.message,emailId:emailRecord.id},'Background processing error');}});
  }catch(err){logger.error({err:err.message},'Incoming email processing error');increment('emailsRejected');res.status(500).json({error:'Processing error'});}
});
module.exports=router;
