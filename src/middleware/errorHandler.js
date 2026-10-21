'use strict';
const logger=require('../monitoring/logger');
function errorHandler(err,req,res,next){const status=err.status||err.statusCode||500;logger.error({requestId:req.id,url:req.url,status,err:err.message},'Request error');if(res.headersSent)return next(err);res.status(status).json({error:status<500?err.message:'Internal server error',requestId:req.id});}
module.exports=errorHandler;
