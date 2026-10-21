'use strict';
const winston=require('winston');
require('winston-daily-rotate-file');
const path=require('path');
const fs=require('fs');
const logDir=process.env.LOG_DIR||'./logs';
if(!fs.existsSync(logDir))fs.mkdirSync(logDir,{recursive:true});
const SENSITIVE=['password','token','secret','key','authorization','smtp_pass','bot_token','api_key','session','cookie','private_key','totp_secret','recovery_codes'];
function redact(obj,depth=0){
  if(depth>5||obj===null||typeof obj!=='object')return obj;
  const r=Array.isArray(obj)?[]:{};
  for(const[k,v]of Object.entries(obj)){
    const lk=k.toLowerCase();
    r[k]=SENSITIVE.some(s=>lk.includes(s))?'[REDACTED]':redact(v,depth+1);
  }
  for(const sym of Object.getOwnPropertySymbols(obj)){
    r[sym]=obj[sym];
  }
  return r;
}
const redactFmt=winston.format(info=>redact(info));
const logger=winston.createLogger({
  level:process.env.LOG_LEVEL||'info',
  format:winston.format.combine(winston.format.timestamp(),redactFmt(),winston.format.errors({stack:true}),winston.format.json()),
  transports:[
    new winston.transports.DailyRotateFile({filename:path.join(logDir,'app-%DATE%.log'),datePattern:'YYYY-MM-DD',maxFiles:'14d',maxSize:'50m'}),
    new winston.transports.DailyRotateFile({level:'error',filename:path.join(logDir,'error-%DATE%.log'),datePattern:'YYYY-MM-DD',maxFiles:'30d'}),
    new winston.transports.Console({
      format: process.env.NODE_ENV==='production'
        ? winston.format.combine(winston.format.timestamp(),redactFmt(),winston.format.json())
        : winston.format.combine(winston.format.colorize(),winston.format.simple())
    })
  ]
});
module.exports=logger;
