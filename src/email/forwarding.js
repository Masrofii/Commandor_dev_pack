'use strict';
const nodemailer=require('nodemailer');
const config=require('../../config/config');
const{getDb}=require('../../database/database');
const logger=require('../monitoring/logger');
function createT(){if(!config.smtp.host)return null;return nodemailer.createTransport({host:config.smtp.host,port:config.smtp.port,secure:config.smtp.secure,auth:{user:config.smtp.user,pass:config.smtp.pass}});}
async function forwardEmail(emailRecord,destination){const db=getDb();const t=createT();if(!t){logger.warn('SMTP not configured;cannot forward');return false;}const logId=db.prepare('INSERT INTO forwarding_log(email_id,destination,status,attempts)VALUES(?,?,?,0)').run(emailRecord.id,destination,'pending').lastInsertRowid;try{await t.sendMail({from:config.smtp.from,to:destination,subject:`[Forwarded] ${emailRecord.subject||'(no subject)'}`,text:emailRecord.text_body||'',html:emailRecord.html_body||'',headers:{'X-Forwarded-From':emailRecord.sender,'X-Original-To':emailRecord.alias_address}});db.prepare("UPDATE forwarding_log SET status='delivered',attempts=1,last_attempt_at=datetime('now')WHERE id=?").run(logId);logger.info({emailId:emailRecord.id,destination},'Email forwarded');return true;}catch(err){db.prepare("UPDATE forwarding_log SET status='failed',attempts=1,last_attempt_at=datetime('now'),error=? WHERE id=?").run(err.message,logId);logger.error({err:err.message,emailId:emailRecord.id},'Forward failed');return false;}}
module.exports={forwardEmail};
