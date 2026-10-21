'use strict';
const{getDb}=require('../../database/database');
const{generateAliasLocalPart,formatCustomAliasLocalPart}=require('../utils/helpers');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
const { logChange } = require('./auditLogger');
function getUserAliases(tgId,opts={}){
  const db=getDb();const{page=1,limit=20,active=null,search=null}=opts;const offset=(page-1)*limit;
  let q='SELECT * FROM aliases WHERE tg_id=?';const p=[tgId];
  if(active!==null){q+=' AND active=?';p.push(active?1:0);}
  if(search){q+=' AND address LIKE ?';p.push(`%${search}%`);}
  q+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';p.push(limit,offset);
  return{aliases:db.prepare(q).all(...p),total:db.prepare('SELECT COUNT(*)as c FROM aliases WHERE tg_id=?').get(tgId).c,page,limit};
}
function getAliasByAddress(address,tgId){return getDb().prepare('SELECT * FROM aliases WHERE address=? AND tg_id=?').get(address,tgId);}
function getAllowedDomains(tgId){
  const db=getDb();
  const custom=db.prepare('SELECT domain FROM custom_domains WHERE tg_id=? AND verified=1 AND active=1').all(tgId).map(r=>r.domain);
  const subdomains=db.prepare('SELECT full_domain FROM subdomains WHERE tg_id=? AND active=1').all(tgId).map(r=>r.full_domain);
  return[...config.domains.list,...custom,...subdomains];
}
function createAlias({tgId,domain,type='throwaway',label=null,expiresAt=null,burner=false,customName=null}){
  const db=getDb();
  const user=db.prepare('SELECT alias_limit, role FROM users WHERE tg_id=?').get(tgId);
  if(!user)throw new Error('User not found');
  const isUnlimited = (user.alias_limit === 0 || user.alias_limit >= 999999 || config.quotas.maxAliases === 0 || config.quotas.maxAliases >= 999999);
  if(!isUnlimited){
    const existing=db.prepare('SELECT COUNT(*)as c FROM aliases WHERE tg_id=? AND active=1').get(tgId).c;
    const limit=user.alias_limit||config.quotas.maxAliases;
    if(existing>=limit)throw new Error(`Alias limit reached (${limit})`);
  }
  const allowed=getAllowedDomains(tgId);
  if(!allowed.includes(domain))throw new Error(`Domain not allowed: ${domain}`);
  const isAdmin = (user.role === 'admin') || (config.telegram.adminId && (String(tgId) === String(config.telegram.adminId)));
  let address;
  if(customName){
    const localPart = formatCustomAliasLocalPart(customName, isAdmin);
    address = `${localPart}@${domain}`;
    const exists = db.prepare('SELECT 1 FROM aliases WHERE address=?').get(address);
    if(exists)throw new Error(`Alias ${address} is already taken. Please choose another name.`);
    if(type === 'throwaway') type = 'custom';
  } else {
    let attempts=0;
    do{address=`${generateAliasLocalPart(10)}@${domain}`;attempts++;if(attempts>10)throw new Error('Could not generate unique alias');}while(db.prepare('SELECT 1 FROM aliases WHERE address=?').get(address));
  }
  const now=new Date().toISOString();
  const burnerExpiresAt=burner?new Date(Date.now()+config.quotas.burnerTtlMinutes*60000).toISOString():null;
  const aliasExpiresAt=expiresAt||(config.quotas.aliasTtlDays>0?new Date(Date.now()+config.quotas.aliasTtlDays*86400000).toISOString():null);
  db.prepare('INSERT INTO aliases(address,tg_id,domain,alias_type,label,created_at,expires_at,burner,burner_expires_at)VALUES(?,?,?,?,?,?,?,?,?)').run(address,tgId,domain,type,label,now,aliasExpiresAt,burner?1:0,burnerExpiresAt);
  logger.info({address,tgId,type,burner,custom:Boolean(customName)},'Alias created');
  logChange({
    tgId,
    category: 'email',
    action: 'alias_created',
    details: `Created ${type} alias ${address}`,
    metadata: { address, domain, type, burner: Boolean(burner), custom: Boolean(customName) }
  }).catch(() => {});
  return db.prepare('SELECT * FROM aliases WHERE address=?').get(address);
}
function deleteAlias(address,tgId){
  const db=getDb();
  if(!db.prepare('SELECT 1 FROM aliases WHERE address=? AND tg_id=?').get(address,tgId))return false;
  db.prepare('DELETE FROM aliases WHERE address=?').run(address);
  logChange({
    tgId,
    category: 'email',
    action: 'alias_deleted',
    details: `Deleted alias ${address}`,
    metadata: { address }
  }).catch(() => {});
  return true;
}
function deactivateAlias(address,tgId){return getDb().prepare('UPDATE aliases SET active=0 WHERE address=? AND tg_id=?').run(address,tgId).changes>0;}
function activateAlias(address,tgId){return getDb().prepare('UPDATE aliases SET active=1 WHERE address=? AND tg_id=?').run(address,tgId).changes>0;}
module.exports={getUserAliases,getAliasByAddress,createAlias,deleteAlias,deactivateAlias,activateAlias,getAllowedDomains};
