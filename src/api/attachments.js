'use strict';
const express=require('express');
const router=express.Router();
const{requireAuth}=require('../middleware/auth');
const{getDriver}=require('../services/storageService');
const{getDb}=require('../../database/database');
router.use(requireAuth);
router.get('/:id',async(req,res)=>{
  const db=getDb();
  const att=db.prepare('SELECT a.*,e.alias_address FROM attachments a JOIN emails e ON a.email_id=e.id JOIN aliases al ON e.alias_address=al.address WHERE a.id=? AND al.tg_id=? AND e.is_deleted=0').get(parseInt(req.params.id),req.tgId);
  if(!att)return res.status(404).json({error:'Attachment not found'});
  if(att.scan_status==='INFECTED')return res.status(403).json({error:'File quarantined: malware detected'});
  try{const storage=getDriver();const stream=await storage.getReadStream(att.filepath);const dangerous=['text/html','application/javascript'];const safeMime=dangerous.includes(att.mime_type)?'application/octet-stream':(att.mime_type||'application/octet-stream');res.setHeader('Content-Type',safeMime);res.setHeader('Content-Disposition',`attachment; filename="${att.safe_filename}"`);res.setHeader('Content-Length',att.size);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');stream.pipe(res);}catch(err){res.status(500).json({error:'Download error'});}
});
module.exports=router;
