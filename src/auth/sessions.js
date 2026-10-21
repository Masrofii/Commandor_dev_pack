'use strict';
const{getDb}=require('../../database/database');
const{generateSecureToken,hashSha256}=require('../utils/crypto');
const{v4:uuidv4}=require('uuid');
const config=require('../../config/config');
function createWebSession(tgId,{userAgent,ipAddress,country}={}){const db=getDb();const raw=generateSecureToken(32);const hash=hashSha256(raw);const id=uuidv4();const expires=new Date(Date.now()+config.session.ttlHours*3600000).toISOString();const dev=parseDevice(userAgent);db.prepare('INSERT INTO web_sessions(id,tg_id,token_hash,user_agent,ip_address,country,device_name,expires_at)VALUES(?,?,?,?,?,?,?,?)').run(id,tgId,hash,userAgent,ipAddress,country,dev,expires);return{sessionId:id,rawToken:raw};}
function verifyWebSession(raw){if(!raw)return null;const db=getDb();const hash=hashSha256(raw);const s=db.prepare("SELECT s.*,u.tg_id,u.role,u.is_banned FROM web_sessions s JOIN users u ON s.tg_id=u.tg_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").get(hash);if(s)db.prepare("UPDATE web_sessions SET last_active_at=datetime('now')WHERE id=?").run(s.id);return s||null;}
function getUserSessions(tgId){return getDb().prepare("SELECT id,device_name,ip_address,country,created_at,last_active_at,expires_at FROM web_sessions WHERE tg_id=? AND expires_at>datetime('now')ORDER BY last_active_at DESC").all(tgId);}
function revokeSession(id,tgId){return getDb().prepare('DELETE FROM web_sessions WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
function revokeAllSessions(tgId,except=null){if(except)return getDb().prepare('DELETE FROM web_sessions WHERE tg_id=? AND id!=?').run(tgId,except).changes;return getDb().prepare('DELETE FROM web_sessions WHERE tg_id=?').run(tgId).changes;}
function parseDevice(ua){if(!ua)return'Unknown device';if(/iPhone/.test(ua))return'iPhone';if(/iPad/.test(ua))return'iPad';if(/Android/.test(ua))return'Android';if(/Windows/.test(ua))return'Windows PC';if(/Mac/.test(ua))return'Mac';if(/Linux/.test(ua))return'Linux';return'Unknown device';}
module.exports={createWebSession,verifyWebSession,getUserSessions,revokeSession,revokeAllSessions};
