'use strict';
const{v4:uuidv4}=require('uuid');
function requestId(req,res,next){req.id=req.headers['x-request-id']||uuidv4();res.setHeader('X-Request-Id',req.id);next();}
module.exports=requestId;
