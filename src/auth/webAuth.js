'use strict';
const express=require('express');
const router=express.Router();
const{verifyTelegramWebAppData,registerOrUpdateUser}=require('./telegramAuth');
const{createWebSession}=require('./sessions');
const{verifyTotp}=require('./twoFactor');
const{getDb}=require('../../database/database');
router.post('/',async(req,res)=>{
  const{initData,totpToken}=req.body;
  if(!initData)return res.status(400).json({error:'initData required'});
  const tgUser=verifyTelegramWebAppData(initData);
  if(!tgUser)return res.status(401).json({error:'Invalid Telegram authentication data'});
  const user=registerOrUpdateUser(tgUser);
  if(user.is_banned)return res.status(403).json({error:'Account suspended'});
  if(user.role==='admin'&&user.totp_enabled){if(!totpToken)return res.status(200).json({requiresTwoFactor:true});if(!verifyTotp(user.tg_id,totpToken))return res.status(401).json({error:'Invalid 2FA token'});}
  const ip=req.ip||req.headers['x-forwarded-for'];
  const{rawToken,sessionId}=createWebSession(user.tg_id,{userAgent:req.headers['user-agent'],ipAddress:ip});
  getDb().prepare('INSERT INTO audit_logs(tg_id,action,ip_address,user_agent)VALUES(?,?,?,?)').run(user.tg_id,'auth.login',ip,req.headers['user-agent']);
  res.json({token:rawToken,sessionId,user:{tgId:user.tg_id,role:user.role,language:user.language,timezone:user.timezone}});
});
module.exports=router;
