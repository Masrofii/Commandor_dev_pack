'use strict';
const{getDb}=require('../../database/database');
const{generateApiKey,hashApiKey}=require('../utils/crypto');
const config=require('../../config/config');
const VALID_SCOPES=['aliases:read','aliases:write','emails:read','emails:delete','attachments:read','webhooks:read','webhooks:write','contacts:read','contacts:write','subdomains:manage','hosting:manage'];
function createApiKey({tgId,name,scopes,expiresAt=null}){const db=getDb();const c=db.prepare('SELECT COUNT(*)as c FROM api_keys WHERE tg_id=? AND revoked=0').get(tgId).c;if(c>=config.quotas.maxApiKeys)throw new Error('API key limit reached');const validScopes=(scopes||[]).filter(s=>VALID_SCOPES.includes(s));const rawKey=generateApiKey();const prefix=rawKey.slice(0,12);const hash=hashApiKey(rawKey);db.prepare('INSERT INTO api_keys(tg_id,name,key_prefix,key_hash,scopes,expires_at)VALUES(?,?,?,?,?,?)').run(tgId,name,prefix,hash,JSON.stringify(validScopes),expiresAt);return{rawKey,prefix,scopes:validScopes};}
function getUserApiKeys(tgId){return getDb().prepare('SELECT id,name,key_prefix,scopes,last_used_at,created_at,expires_at,revoked FROM api_keys WHERE tg_id=? ORDER BY created_at DESC').all(tgId);}
function verifyApiKey(rawKey){const db=getDb();const hash=hashApiKey(rawKey);const key=db.prepare("SELECT * FROM api_keys WHERE key_hash=? AND revoked=0 AND(expires_at IS NULL OR expires_at>datetime('now'))").get(hash);if(key)db.prepare("UPDATE api_keys SET last_used_at=datetime('now')WHERE id=?").run(key.id);return key||null;}
function revokeApiKey(id,tgId){return getDb().prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
module.exports={createApiKey,getUserApiKeys,verifyApiKey,revokeApiKey,VALID_SCOPES};
