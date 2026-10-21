'use strict';
const nodemailer=require('nodemailer');
const config=require('../../config/config');
const{getDb}=require('../../database/database');
const logger=require('../monitoring/logger');
async function sendReply({originalEmailId,tgId,replyText,replyHtml}){
  const db=getDb();
  const original=db.prepare('SELECT e.*,a.tg_id FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE e.id=? AND a.tg_id=? AND e.is_deleted=0').get(originalEmailId,tgId);
  if(!original)throw new Error('Email not found or access denied');
  if(!config.smtp.host)throw new Error('SMTP not configured');
  const replyTo=original.reply_to||original.sender;
  const t=nodemailer.createTransport({host:config.smtp.host,port:config.smtp.port,secure:config.smtp.secure,auth:{user:config.smtp.user,pass:config.smtp.pass}});
  const headers={};
  if(original.message_id){headers['In-Reply-To']=original.message_id;headers['References']=original.message_id;}
  await t.sendMail({from:`<${original.alias_address}>`,to:replyTo,subject:`Re: ${original.subject||''}`,text:replyText||'',html:replyHtml||undefined,headers});
  logger.info({originalEmailId,replyTo},'Reply sent');
  return true;
}
module.exports={sendReply};
