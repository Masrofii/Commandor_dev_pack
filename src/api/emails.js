'use strict';
const express=require('express');
const router=express.Router();
const{requireAuthOrApiKey}=require('../middleware/auth');
const{getEmails,getEmailById,getUnreadCount,markRead,markStarred,softDeleteEmail}=require('../services/emailService');
const{getDb}=require('../../database/database');
const{parseSearchQuery}=require('../utils/validation');
const{notifyWebSocket}=require('../services/notificationService');
router.use(requireAuthOrApiKey(['emails:read']));
router.get('/',(req,res)=>{
  try{
    let{page,limit,alias,unread,starred,q}=req.query;
    if(alias==='undefined'||alias==='null'||!alias||!alias.trim())alias=undefined;
    if(q==='undefined'||q==='null'||!q||!q.trim())q=undefined;
    const parsed=q?parseSearchQuery(q):{};
    res.json(getEmails(req.tgId,{
      page:parseInt(page)||1,
      limit:Math.min(parseInt(limit)||20,100),
      alias:alias?alias.trim():undefined,
      unread:unread==='true'?true:undefined,
      starred:starred==='true'?true:undefined,
      search:parsed.ftsQuery||undefined
    }));
  }catch(err){
    res.status(500).json({error:err.message});
  }
});
router.get('/unread-count',(req,res)=>{try{res.json({unread:getUnreadCount(req.tgId)});}catch(err){res.status(500).json({error:err.message});}});
router.get('/:id',(req,res)=>{const e=getEmailById(parseInt(req.params.id),req.tgId);if(!e)return res.status(404).json({error:'Email not found'});markRead(e.id,req.tgId);notifyWebSocket(req.tgId,'email.read',{id:e.id});const atts=getDb().prepare('SELECT id,filename,safe_filename,mime_type,size,sha256,scan_status FROM attachments WHERE email_id=?').all(e.id);res.json({...e,attachments:atts});});
router.get('/:id/eml',(req,res)=>{const e=getEmailById(parseInt(req.params.id),req.tgId);if(!e)return res.status(404).json({error:'Email not found'});const fs=require('fs');if(e.raw_eml_path&&fs.existsSync(e.raw_eml_path)){res.setHeader('Content-Disposition',`attachment; filename="email-${e.id}.eml"`);res.setHeader('Content-Type','message/rfc822');return fs.createReadStream(e.raw_eml_path).pipe(res);}const sanitizedSubject=(e.subject||'email').replace(/[^a-zA-Z0-9_-]/g,'_');res.setHeader('Content-Disposition',`attachment; filename="${sanitizedSubject}-${e.id}.eml"`);res.setHeader('Content-Type','message/rfc822');const emlContent=[`From: ${e.sender_name?`"${e.sender_name}" <${e.sender}>`:e.sender}`,`To: <${e.recipient||e.alias_address}>`,`Subject: ${e.subject||'(no subject)'}`,`Date: ${new Date(e.received_at).toUTCString()}`,`Message-ID: ${e.message_id||`<${e.id}@commandor.mail>`}`,'MIME-Version: 1.0','Content-Type: text/html; charset=utf-8','',e.clean_html||e.html_body||e.text_body||''].join('\r\n');return res.send(emlContent);});
router.patch('/:id/read',(req,res)=>{if(!markRead(parseInt(req.params.id),req.tgId))return res.status(404).json({error:'Email not found'});notifyWebSocket(req.tgId,'email.read',{id:parseInt(req.params.id)});res.json({status:'ok'});});
router.patch('/:id/star',(req,res)=>{if(!markStarred(parseInt(req.params.id),req.tgId,req.body.starred!==false))return res.status(404).json({error:'Email not found'});res.json({status:'ok'});});
router.delete('/:id',(req,res)=>{if(!softDeleteEmail(parseInt(req.params.id),req.tgId))return res.status(404).json({error:'Email not found'});notifyWebSocket(req.tgId,'email.deleted',{id:parseInt(req.params.id)});res.json({status:'deleted'});});
module.exports=router;
