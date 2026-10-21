'use strict';
const express=require('express');
const router=express.Router();
const{consumeLoginToken}=require('../auth/loginToken');
const{createWebSession}=require('../auth/sessions');
const{getDb}=require('../../database/database');
// Exchanges a single-use Telegram login token (created by the bot's /login
// command) for a regular web session token.
router.post('/login',(req,res)=>{
  const tgId=consumeLoginToken(req.body?.token);
  if(!tgId)return res.status(401).json({error:'Login link invalid or expired'});
  const user=getDb().prepare('SELECT tg_id,role,language,timezone,is_banned,totp_enabled FROM users WHERE tg_id=?').get(tgId);
  if(!user)return res.status(401).json({error:'User not found'});
  if(user.is_banned)return res.status(403).json({error:'Account suspended'});
  const ip=req.ip||req.headers['x-forwarded-for'];
  const{rawToken,sessionId}=createWebSession(user.tg_id,{userAgent:req.headers['user-agent'],ipAddress:ip});
  getDb().prepare('INSERT INTO audit_logs(tg_id,action,ip_address,user_agent)VALUES(?,?,?,?)').run(user.tg_id,'auth.login_bot',ip,req.headers['user-agent']);
  res.json({token:rawToken,sessionId,user:{tgId:user.tg_id,role:user.role,language:user.language,timezone:user.timezone}});
});
module.exports=router;
