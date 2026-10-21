'use strict';
const express=require('express');
const router=express.Router();
const{requireAuth}=require('../middleware/auth');
const{sendReply}=require('../email/reply');
const{body,validationResult}=require('express-validator');
router.use(requireAuth);
router.post('/',[body('emailId').isInt({min:1}),body('text').isString().isLength({min:1,max:50000})],async(req,res)=>{const err=validationResult(req);if(!err.isEmpty())return res.status(400).json({errors:err.array()});try{await sendReply({originalEmailId:req.body.emailId,tgId:req.tgId,replyText:req.body.text,replyHtml:req.body.html});res.json({status:'sent'});}catch(e){res.status(400).json({error:e.message});}});
module.exports=router;
