'use strict';
const speakeasy=require('speakeasy');
const qrcode=require('qrcode');
const crypto=require('crypto');
const{getDb}=require('../../database/database');
const{encryptAes256,decryptAes256}=require('../utils/crypto');
const config=require('../../config/config');
function generateTotpSecret(username){return speakeasy.generateSecret({name:`${config.admin2fa.issuer} (${username})`,issuer:config.admin2fa.issuer,length:32});}
async function getTotpQrDataUrl(secret){return qrcode.toDataURL(secret.otpauth_url);}
function generateRecoveryCodes(n=8){const c=[];for(let i=0;i<n;i++)c.push(crypto.randomBytes(5).toString('hex').toUpperCase());return c;}
function enableTotp(tgId,secret,token,recoveryCodes){const valid=speakeasy.totp.verify({secret:secret.base32,encoding:'base32',token,window:2});if(!valid)throw new Error('Invalid TOTP token');const db=getDb();const enc=encryptAes256(secret.base32,config.session.secret);const encC=encryptAes256(JSON.stringify(recoveryCodes),config.session.secret);db.prepare('UPDATE users SET totp_secret=?,totp_enabled=1,totp_recovery_codes=? WHERE tg_id=?').run(enc,encC,tgId);}
function verifyTotp(tgId,token){const db=getDb();const u=db.prepare('SELECT totp_secret,totp_enabled,totp_recovery_codes FROM users WHERE tg_id=?').get(tgId);if(!u?.totp_enabled||!u?.totp_secret)return false;const secret=decryptAes256(u.totp_secret,config.session.secret);if(speakeasy.totp.verify({secret,encoding:'base32',token,window:2}))return true;try{const codes=JSON.parse(decryptAes256(u.totp_recovery_codes,config.session.secret));const norm=token.toUpperCase().replace(/\s/g,'');const idx=codes.indexOf(norm);if(idx!==-1){codes.splice(idx,1);db.prepare('UPDATE users SET totp_recovery_codes=? WHERE tg_id=?').run(encryptAes256(JSON.stringify(codes),config.session.secret),tgId);return true;}}catch{}return false;}
function disableTotp(tgId){getDb().prepare('UPDATE users SET totp_secret=NULL,totp_enabled=0,totp_recovery_codes=NULL WHERE tg_id=?').run(tgId);}
module.exports={generateTotpSecret,getTotpQrDataUrl,generateRecoveryCodes,enableTotp,verifyTotp,disableTotp};
