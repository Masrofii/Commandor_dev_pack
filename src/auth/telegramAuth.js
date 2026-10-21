'use strict';
const crypto=require('crypto');
const{getDb}=require('../../database/database');
const config=require('../../config/config');
function verifyTelegramWebAppData(initData){const params=new URLSearchParams(initData);const hash=params.get('hash');if(!hash)return null;params.delete('hash');const dcs=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const sk=crypto.createHmac('sha256','WebAppData').update(config.telegram.token).digest();const ch=crypto.createHmac('sha256',sk).update(dcs).digest('hex');if(ch!==hash)return null;const ad=parseInt(params.get('auth_date'),10);if(Date.now()/1000-ad>3600)return null;const up=params.get('user');return up?JSON.parse(up):null;}
function registerOrUpdateUser(tgUser){const db=getDb();const e=db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgUser.id);if(!e){db.prepare('INSERT INTO users(tg_id,username,first_name,last_name)VALUES(?,?,?,?)').run(tgUser.id,tgUser.username||null,tgUser.first_name||null,tgUser.last_name||null);}else{db.prepare("UPDATE users SET last_seen_at=datetime('now'),username=?,first_name=? WHERE tg_id=?").run(tgUser.username||null,tgUser.first_name||null,tgUser.id);}return db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgUser.id);}
module.exports={verifyTelegramWebAppData,registerOrUpdateUser};
