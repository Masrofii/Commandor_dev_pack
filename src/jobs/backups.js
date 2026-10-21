'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const config=require('../../config/config');
const logger=require('../monitoring/logger');
const dayjs=require('dayjs');
async function runBackup(){
  const dir=config.backup.dir;if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
  const dbPath=config.database.path;if(!fs.existsSync(dbPath)){logger.error('DB file not found for backup');return;}
  const ts=dayjs().format('YYYY-MM-DD_HH-mm-ss');const bp=path.join(dir,`backup_${ts}.db.gz`);
  await new Promise((res,rej)=>{const src=fs.createReadStream(dbPath);const dst=fs.createWriteStream(bp);const gz=zlib.createGzip({level:9});src.pipe(gz).pipe(dst);dst.on('finish',res);dst.on('error',rej);src.on('error',rej);});
  logger.info({backupPath:bp,size:fs.statSync(bp).size},'Backup created');
  await pruneBackups(dir);return bp;
}
async function pruneBackups(dir){
  const files=fs.readdirSync(dir).filter(f=>f.startsWith('backup_')&&f.endsWith('.db.gz')).sort().reverse();
  const keep=new Set();files.slice(0,config.backup.retentionDaily).forEach(f=>keep.add(f));
  const weeks=new Set();
  for(const f of files){const m=f.match(/backup_(\d{4}-\d{2}-\d{2})/);if(m){const w=dayjs(m[1]).format('YYYY-WW');if(!weeks.has(w)&&weeks.size<config.backup.retentionWeekly){keep.add(f);weeks.add(w);}}}
  for(const f of files)if(!keep.has(f)){fs.unlinkSync(path.join(dir,f));logger.info({file:f},'Old backup pruned');}
}
module.exports={runBackup};
