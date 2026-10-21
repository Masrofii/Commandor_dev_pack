'use strict';
const crypto=require('crypto');
const bcrypt=require('bcrypt');
const ROUNDS=12;
function generateSecureToken(bytes=32){return crypto.randomBytes(bytes).toString('hex');}
function generateApiKey(){return'tmk_'+crypto.randomBytes(32).toString('base64url');}
function hashApiKey(key){return crypto.createHash('sha256').update(key).digest('hex');}
function hashPassword(pw){return bcrypt.hash(pw,ROUNDS);}
function verifyPassword(pw,hash){return bcrypt.compare(pw,hash);}
function hashSha256(data){return crypto.createHash('sha256').update(data).digest('hex');}
function generateIdempotencyKey(a,b,c){return hashSha256(`${a}:${b}:${c}`);}
function hmacSign(secret,payload){return crypto.createHmac('sha256',secret).update(payload).digest('hex');}
function hmacVerify(secret,payload,sig){try{const expected=hmacSign(secret,payload);const provided=sig.replace(/^sha256=/,'');if(expected.length!==provided.length)return false;return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(provided,'hex'));}catch{return false;}}
function generateVerificationToken(){return`tmpmail-verify-${crypto.randomBytes(16).toString('hex')}`;}
function encryptAes256(data,key){const iv=crypto.randomBytes(16);const k=crypto.createHash('sha256').update(key).digest();const cipher=crypto.createCipheriv('aes-256-gcm',k,iv);const enc=Buffer.concat([cipher.update(data,'utf8'),cipher.final()]);const tag=cipher.getAuthTag();return Buffer.concat([iv,tag,enc]).toString('base64');}
function decryptAes256(enc64,key){const buf=Buffer.from(enc64,'base64');const iv=buf.slice(0,16);const tag=buf.slice(16,32);const data=buf.slice(32);const k=crypto.createHash('sha256').update(key).digest();const d=crypto.createDecipheriv('aes-256-gcm',k,iv);d.setAuthTag(tag);return d.update(data)+d.final('utf8');}
module.exports={generateSecureToken,generateApiKey,hashApiKey,hashPassword,verifyPassword,hashSha256,generateIdempotencyKey,hmacSign,hmacVerify,generateVerificationToken,encryptAes256,decryptAes256};
