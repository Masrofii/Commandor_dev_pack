'use strict';
const jwt=require('jsonwebtoken');
const config=require('../../config/config');
const{getDb}=require('../../database/database');
const{generateSecureToken}=require('../utils/crypto');
// Short-lived, single-use tokens that let a user who authenticated in
// Telegram open a web session without repeating the Telegram Login flow.
const TTL='10m';
function createLoginToken(tgId){
  const jti=generateSecureToken(16);
  return jwt.sign({sub:String(tgId),purpose:'web_login',jti},config.jwt.secret,{expiresIn:TTL});
}
function consumeLoginToken(raw){
  if(typeof raw!=='string'||!raw)return null;
  let payload;
  try{payload=jwt.verify(raw,config.jwt.secret);}catch{return null;}
  if(!payload||payload.purpose!=='web_login')return null;
  const db=getDb();
  // The idempotency table doubles as a single-use registry: if the INSERT
  // didn't add a row, this token has already been redeemed.
  const{changes}=db.prepare('INSERT OR IGNORE INTO idempotency(key)VALUES(?)').run(`web_login:${payload.jti}`);
  if(changes===0)return null;
  return parseInt(payload.sub,10);
}
module.exports={createLoginToken,consumeLoginToken};
