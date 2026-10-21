'use strict';
const{getDb}=require('../../database/database');
const config=require('../../config/config');

function checkStorageQuota(tgId,add){
  const db=getDb();
  const u=db.prepare('SELECT storage_used,storage_limit FROM users WHERE tg_id=?').get(tgId);
  if(!u)throw new Error('User not found');
  const limit=u.storage_limit||config.quotas.maxStorageBytes;
  if(!limit||limit===0||limit>=107374182400)return true;
  if(u.storage_used+add>limit)throw new Error(`Storage quota exceeded`);
  return true;
}

function getUserStorageStats(tgId){
  const db=getDb();
  const u=db.prepare('SELECT storage_used,storage_limit FROM users WHERE tg_id=?').get(tgId);
  const limit=u?.storage_limit||config.quotas.maxStorageBytes;
  const isUnlimited = (!limit || limit === 0 || limit >= 107374182400);
  return{
    used:u?.storage_used||0,
    limit:isUnlimited ? 0 : limit,
    unlimited: isUnlimited,
    available:isUnlimited ? Infinity : Math.max(0,limit-(u?.storage_used||0)),
    percent:isUnlimited ? 0 : (u&&limit?Math.round((u.storage_used/limit)*100):0)
  };
}

function checkAliasQuota(tgId){
  const db=getDb();
  const u=db.prepare('SELECT alias_limit FROM users WHERE tg_id=?').get(tgId);
  const active=db.prepare('SELECT COUNT(*)as c FROM aliases WHERE tg_id=? AND active=1').get(tgId).c;
  const limit=u?.alias_limit||config.quotas.maxAliases;
  const isUnlimited = (limit === 0 || limit >= 999999);
  return{active,limit:isUnlimited ? 0 : limit,unlimited:isUnlimited,canCreate:isUnlimited || active<limit};
}

module.exports={checkStorageQuota,getUserStorageStats,checkAliasQuota};
