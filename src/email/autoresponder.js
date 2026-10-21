'use strict';
const{getDb}=require('../../database/database');
const{isSystemAddress}=require('../utils/helpers');
const nodemailer=require('nodemailer');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
function shouldAutoReply(alias,senderEmail){if(!alias.auto_reply_enabled)return false;if(isSystemAddress(senderEmail))return false;if(!alias.auto_reply_body)return false;const db=getDb();const cool=alias.auto_reply_cooldown_hours||24;return!db.prepare(`SELECT id FROM auto_reply_log WHERE alias_address=? AND sender=? AND replied_at>datetime('now',?)`).get(alias.address,senderEmail,`-${cool} hours`);}
async function sendAutoReply(alias,originalEmail){if(!config.smtp.host){logger.warn('SMTP not configured;skip auto-reply');return;}const t=nodemailer.createTransport({host:config.smtp.host,port:config.smtp.port,secure:config.smtp.secure,auth:{user:config.smtp.user,pass:config.smtp.pass}});const replyTo=originalEmail.replyTo||originalEmail.sender;try{await t.sendMail({from:`<${config.smtp.from}>`,to:replyTo,subject:alias.auto_reply_subject||`Re: ${originalEmail.subject}`,text:alias.auto_reply_body,headers:{'Auto-Submitted':'auto-replied','X-Auto-Response-Suppress':'All','Precedence':'auto-reply'}});getDb().prepare('INSERT INTO auto_reply_log(alias_address,sender)VALUES(?,?)').run(alias.address,replyTo);logger.info({alias:alias.address,to:replyTo},'Auto-reply sent');}catch(err){logger.error({err:err.message,alias:alias.address},'Auto-reply failed');}}
module.exports={shouldAutoReply,sendAutoReply};
