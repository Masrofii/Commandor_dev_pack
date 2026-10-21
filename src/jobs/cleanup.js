'use strict';
const{getDb}=require('../../database/database');
const{getDriver}=require('../services/storageService');
const logger=require('../monitoring/logger');
async function runCleanup({dryRun=false}={}){
  logger.info({dryRun},'Starting cleanup job');
  const db=getDb();const storage=getDriver();
  let stats={emails:0,aliases:0,attachments:0,sessions:0,idempotency:0};
  // Burner aliases
  const burners=db.prepare("SELECT address FROM aliases WHERE burner=1 AND burner_expires_at<datetime('now') AND active=1").all();
  for(const b of burners){if(!dryRun){const eids=db.prepare('SELECT id FROM emails WHERE alias_address=?').all(b.address).map(r=>r.id);for(const eid of eids){const atts=db.prepare('SELECT filepath FROM attachments WHERE email_id=?').all(eid);for(const att of atts){try{await storage.delete(att.filepath);}catch{}stats.attachments++;}}db.prepare('DELETE FROM aliases WHERE address=?').run(b.address);}stats.aliases++;logger.info({address:b.address,dryRun},'Burner alias expired');}
  // Expired aliases
  const expAliases=db.prepare("SELECT address FROM aliases WHERE expires_at<datetime('now') AND active=1").all();
  for(const a of expAliases){if(!dryRun)db.prepare('UPDATE aliases SET active=0 WHERE address=?').run(a.address);stats.aliases++;}
  // Expired emails
  const expEmails=db.prepare("SELECT id FROM emails WHERE expires_at<datetime('now') AND expires_at IS NOT NULL").all();
  for(const e of expEmails){if(!dryRun){const atts=db.prepare('SELECT filepath FROM attachments WHERE email_id=?').all(e.id);for(const att of atts){try{await storage.delete(att.filepath);}catch{}stats.attachments++;}db.prepare('DELETE FROM emails WHERE id=?').run(e.id);}stats.emails++;}
  // Soft-deleted emails older than 30 days
  const softDel=db.prepare("SELECT id FROM emails WHERE is_deleted=1 AND received_at<datetime('now','-30 days')").all();
  for(const e of softDel){if(!dryRun){const atts=db.prepare('SELECT filepath FROM attachments WHERE email_id=?').all(e.id);for(const att of atts){try{await storage.delete(att.filepath);}catch{}stats.attachments++;}db.prepare('DELETE FROM emails WHERE id=?').run(e.id);}stats.emails++;}
  if(!dryRun){stats.sessions=db.prepare("DELETE FROM web_sessions WHERE expires_at<datetime('now')").run().changes;stats.idempotency=db.prepare("DELETE FROM idempotency WHERE created_at<datetime('now','-7 days')").run().changes;db.prepare("DELETE FROM auto_reply_log WHERE replied_at<datetime('now','-30 days')").run();}
  logger.info({dryRun,stats},'Cleanup complete');return stats;
}
module.exports={runCleanup};
