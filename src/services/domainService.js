'use strict';
const dns=require('dns').promises;
const{getDb}=require('../../database/database');
const{generateVerificationToken}=require('../utils/crypto');
const{isValidDomain}=require('../utils/validation');
const logger=require('../monitoring/logger');
function getUserDomains(tgId){return getDb().prepare('SELECT * FROM custom_domains WHERE tg_id=? ORDER BY created_at DESC').all(tgId);}
function addDomain(tgId,domain){if(!isValidDomain(domain))throw new Error('Invalid domain format');const db=getDb();const e=db.prepare('SELECT * FROM custom_domains WHERE domain=?').get(domain);if(e&&e.tg_id!==tgId)throw new Error('Domain already registered by another user');if(e)return e;const token=generateVerificationToken();db.prepare('INSERT INTO custom_domains(tg_id,domain,verification_token)VALUES(?,?,?)').run(tgId,domain,token);return db.prepare('SELECT * FROM custom_domains WHERE domain=?').get(domain);}
async function verifyDomain(d){const db=getDb();try{const records=await dns.resolveTxt(d.domain);const flat=records.map(r=>r.join('')).flat();const found=flat.some(r=>r.includes(d.verification_token));db.prepare("UPDATE custom_domains SET dns_checked_at=datetime('now')WHERE id=?").run(d.id);if(found){db.prepare("UPDATE custom_domains SET verified=1,verified_at=datetime('now'),active=1 WHERE id=?").run(d.id);return{verified:true};}return{verified:false,message:'TXT record not found'};}catch(err){return{verified:false,message:`DNS error: ${err.message}`};}}
function deleteDomain(id,tgId){return getDb().prepare('DELETE FROM custom_domains WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
module.exports={getUserDomains,addDomain,verifyDomain,deleteDomain};
