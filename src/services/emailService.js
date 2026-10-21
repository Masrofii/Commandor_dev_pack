'use strict';
const{getDb,transaction}=require('../../database/database');
const{sanitizeEmailHtml}=require('../email/sanitizer');
const{findOrCreateThread,updateThread}=require('../email/threading');
const{scoreSpam}=require('../email/spamScore');
const{processAuthHeaders}=require('../email/authChecks');
const{getDriver}=require('./storageService');
const{hashSha256}=require('../utils/crypto');
const{sanitizeFilename}=require('../utils/validation');
const logger=require('../monitoring/logger');
const path=require('path');

async function storeEmail({parsedEmail,rawEml,aliasRecord,workerMeta={}}){
  const db=getDb();const storage=getDriver();
  const authResults=processAuthHeaders(parsedEmail.headers);
  const spamResult=scoreSpam({subject:parsedEmail.subject,textBody:parsedEmail.textBody,sender:parsedEmail.sender,spfResult:workerMeta.spf||authResults.spf,dkimResult:workerMeta.dkim||authResults.dkim,dmarcResult:workerMeta.dmarc||authResults.dmarc});
  const now=new Date().toISOString();
  const receivedAt=parsedEmail.date?parsedEmail.date.toISOString():now;
  const threadId=findOrCreateThread(aliasRecord.address,parsedEmail.messageId,parsedEmail.inReplyTo,parsedEmail.references,parsedEmail.subject);
  const cleanHtml=sanitizeEmailHtml(parsedEmail.htmlBody,{removeTrackers:true});
  let rawEmlPath=null;
  if(rawEml){const n=`${hashSha256(rawEml).slice(0,16)}.eml`;const rp=path.join('eml',aliasRecord.tg_id.toString(),n);await storage.save(rp,rawEml);rawEmlPath=rp;}
  const sizeBytes=rawEml?rawEml.length:0;
  const storeTx=transaction(()=>{
    const result=db.prepare('INSERT INTO emails(alias_address,message_id,thread_id,sender,sender_name,recipient,reply_to,subject,text_body,html_body,clean_html,has_attachments,spam_score,spam_classification,spf_result,dkim_result,dmarc_result,origin_ip,raw_eml_path,size_bytes,received_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(aliasRecord.address,parsedEmail.messageId,threadId,parsedEmail.sender,parsedEmail.senderName,parsedEmail.recipient,parsedEmail.replyTo,parsedEmail.subject,parsedEmail.textBody,parsedEmail.htmlBody,cleanHtml,parsedEmail.attachments.length>0?1:0,spamResult.score,spamResult.classification,workerMeta.spf||authResults.spf,workerMeta.dkim||authResults.dkim,workerMeta.dmarc||authResults.dmarc,workerMeta.originIp||null,rawEmlPath,sizeBytes,receivedAt);
    const emailId=result.lastInsertRowid;
    updateThread(db,threadId,aliasRecord.address,parsedEmail.subject,receivedAt);
    db.prepare('UPDATE users SET storage_used=storage_used+? WHERE tg_id=?').run(sizeBytes,aliasRecord.tg_id);
    return emailId;
  });
  const emailId=storeTx();
  for(const att of parsedEmail.attachments){try{await storeAttachment(att,emailId,aliasRecord.tg_id);}catch(err){logger.error({err:err.message,emailId},'Attachment storage failed');}}
  const emailRecord=db.prepare('SELECT * FROM emails WHERE id=?').get(emailId);
  return{emailRecord,spamResult,authResults};
}

async function storeAttachment(att,emailId,tgId){
  const db=getDb();const storage=getDriver();
  const existing=db.prepare('SELECT * FROM attachments WHERE sha256=? AND email_id=?').get(att.sha256,emailId);
  if(existing)return existing;
  const safe=sanitizeFilename(att.filename);const ext=safe.split('.').pop()||'bin';
  const stored=`${att.sha256.slice(0,16)}_${Date.now()}.${ext}`;const relPath=path.join('attachments',tgId.toString(),stored);
  await storage.save(relPath,att.content);
  const row=db.prepare('INSERT INTO attachments(email_id,filename,safe_filename,filepath,mime_type,size,sha256,scan_status)VALUES(?,?,?,?,?,?,?,?)').run(emailId,att.filename,safe,relPath,att.contentType,att.size,att.sha256,'PENDING');
  return db.prepare('SELECT * FROM attachments WHERE id=?').get(row.lastInsertRowid);
}

function getEmails(tgId,opts={}){
  const db=getDb();const{alias,page=1,limit=20,unread,starred,search}=opts;const offset=(page-1)*limit;
  // The same WHERE clause drives both the page query and the total, so
  // counts and pagination stay correct when filters/search are applied.
  let where='a.tg_id=? AND e.is_deleted=0';const p=[tgId];
  if(alias){where+=' AND e.alias_address=?';p.push(alias);}
  if(unread===true){where+=' AND e.is_read=0';}
  if(starred===true){where+=' AND e.is_starred=1';}
  if(search){where+=' AND e.id IN(SELECT rowid FROM emails_fts WHERE emails_fts MATCH ?)';p.push(search);}
  const emails=db.prepare(`SELECT e.* FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE ${where} ORDER BY e.received_at DESC LIMIT ? OFFSET ?`).all(...p,limit,offset);
  const total=db.prepare(`SELECT COUNT(*)as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE ${where}`).get(...p).c;
  return{emails,total,page,limit};
}
function getEmailById(id,tgId){return getDb().prepare('SELECT e.* FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE e.id=? AND a.tg_id=? AND e.is_deleted=0').get(id,tgId);}
function getUnreadCount(tgId){return getDb().prepare('SELECT COUNT(*)as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_deleted=0 AND e.is_read=0').get(tgId).c;}
function markRead(id,tgId){return getDb().prepare('UPDATE emails SET is_read=1 WHERE id=? AND alias_address IN(SELECT address FROM aliases WHERE tg_id=?)').run(id,tgId).changes>0;}
function markStarred(id,tgId,starred){return getDb().prepare('UPDATE emails SET is_starred=? WHERE id=? AND alias_address IN(SELECT address FROM aliases WHERE tg_id=?)').run(starred?1:0,id,tgId).changes>0;}
function softDeleteEmail(id,tgId){return getDb().prepare('UPDATE emails SET is_deleted=1 WHERE id=? AND alias_address IN(SELECT address FROM aliases WHERE tg_id=?)').run(id,tgId).changes>0;}
module.exports={storeEmail,storeAttachment,getEmails,getEmailById,getUnreadCount,markRead,markStarred,softDeleteEmail};
