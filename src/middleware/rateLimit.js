'use strict';
const rateLimit=require('express-rate-limit');
const defaultLimiter=rateLimit({windowMs:15*60*1000,max:200,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests'}});
const authLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{error:'Too many authentication attempts'}});
const incomingEmailLimiter=rateLimit({windowMs:60*1000,max:60,keyGenerator:(req)=>req.headers['x-forwarded-for']||req.ip,message:{error:'Incoming mail rate limit exceeded'}});
const apiLimiter=rateLimit({windowMs:60*1000,max:100,keyGenerator:(req)=>req.apiKey?.id||req.user?.tg_id||req.ip,message:{error:'API rate limit exceeded'}});
module.exports={defaultLimiter,authLimiter,incomingEmailLimiter,apiLimiter};
