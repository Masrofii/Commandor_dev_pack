'use strict';
const{getDb}=require('../../database/database');
const archiver=require('archiver');
const fs=require('fs');
const path=require('path');
const{v4:uuidv4}=require('uuid');
const logger=require('../monitoring/logger');
async function startExportJob(tgId,format,filters){const db=getDb();const jobId=uuidv4();db.prepare("INSERT INTO export_jobs(id,tg_id,format,filters,status)VALUES(?,?,?,?,'pending')").run(jobId,tgId,format,JSON.stringify(filters||{}));processExportJob(jobId,tgId,format,filters).catch(err=>logger.error({err:err.message,jobId},'Export failed'));return jobId;}
async function processExportJob(jobId,tgId,format,filters){const db=getDb();db.prepare("UPDATE export_jobs SET status='processing'WHERE id=?").run(jobId);try{const emails=db.prepare('SELECT e.* FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_deleted=0 ORDER BY e.received_at DESC').all(tgId);const dir=path.join('./exports',tgId.toString());fs.mkdirSync(dir,{recursive:true});const fp=path.join(dir,`export_${jobId}.${format==='mbox'?'mbox':'zip'}`);if(format==='mbox')await exportMbox(emails,fp);else await exportZip(emails,fp);db.prepare("UPDATE export_jobs SET status='complete',file_path=?,completed_at=datetime('now')WHERE id=?").run(fp,jobId);}catch(err){db.prepare("UPDATE export_jobs SET status='failed',error=? WHERE id=?").run(err.message,jobId);throw err;}}
async function exportMbox(emails,fp){const s=fs.createWriteStream(fp);for(const e of emails){s.write(`From ${e.sender} ${new Date(e.received_at).toUTCString()}\r\nFrom: ${e.sender}\r\nTo: ${e.alias_address}\r\nSubject: ${e.subject||'(no subject)'}\r\n\r\n${e.text_body||''}\r\n\r\n`);}return new Promise((res,rej)=>{s.end();s.on('finish',res);s.on('error',rej);});}
async function exportZip(emails,fp){return new Promise((res,rej)=>{const out=fs.createWriteStream(fp);const arc=archiver('zip',{zlib:{level:9}});arc.on('error',rej);out.on('close',res);arc.pipe(out);for(const e of emails){const subj=(e.subject||'email').replace(/[^a-z0-9]/gi,'_').slice(0,50);arc.append(`From: ${e.sender}\r\nTo: ${e.alias_address}\r\nSubject: ${e.subject||''}\r\nDate: ${new Date(e.received_at).toUTCString()}\r\n\r\n${e.text_body||''}`,{name:`${e.id}_${subj}.eml`});}arc.finalize();});}
function getExportJob(id,tgId){return getDb().prepare('SELECT * FROM export_jobs WHERE id=? AND tg_id=?').get(id,tgId);}
module.exports={startExportJob,getExportJob};
