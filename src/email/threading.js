'use strict';
const{v4:uuidv4}=require('uuid');
const{getDb}=require('../../database/database');
const{normalizeSubject}=require('../utils/helpers');
function findOrCreateThread(aliasAddress,messageId,inReplyTo,references,subject){
  const db=getDb();
  const allRefs=[inReplyTo,...(references||[])].filter(Boolean);
  for(const ref of allRefs){const e=db.prepare('SELECT thread_id FROM emails WHERE alias_address=? AND message_id=? LIMIT 1').get(aliasAddress,ref);if(e)return e.thread_id;}
  const ns=normalizeSubject(subject||'');
  if(ns){const e=db.prepare("SELECT thread_id FROM emails WHERE alias_address=? AND subject LIKE ? AND received_at>datetime('now','-24 hours') LIMIT 1").get(aliasAddress,`%${ns}%`);if(e)return e.thread_id;}
  return uuidv4();
}
function updateThread(db,threadId,aliasAddress,subject,lastMessageAt){
  const e=db.prepare('SELECT id FROM threads WHERE id=?').get(threadId);
  if(e){db.prepare("UPDATE threads SET message_count=message_count+1,last_message_at=?,is_read=0 WHERE id=?").run(lastMessageAt,threadId);}
  else{db.prepare('INSERT INTO threads(id,alias_address,subject,message_count,last_message_at)VALUES(?,?,?,1,?)').run(threadId,aliasAddress,subject||'(no subject)',lastMessageAt);}
}
module.exports={findOrCreateThread,updateThread};
