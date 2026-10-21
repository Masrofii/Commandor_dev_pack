'use strict';
const os=require('os');
const config=require('../../config/config');
const logger=require('./logger');
const axios=require('axios');
const cooldowns=new Map();
const COOLDOWN=15*60*1000;
function canAlert(key){const last=cooldowns.get(key);if(!last||Date.now()-last>COOLDOWN){cooldowns.set(key,Date.now());return true;}return false;}
async function sendTg(msg){const{token,adminId}=config.telegram;if(!token||!adminId)return;try{await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,{chat_id:adminId,text:msg,parse_mode:'HTML'},{timeout:10000});}catch(e){logger.error({err:e.message},'TG alert failed');}}
async function sendDiscord(msg){const url=config.health.discordWebhook;if(!url)return;try{await axios.post(url,{content:msg},{timeout:10000});}catch(e){logger.error({err:e.message},'Discord alert failed');}}
async function alert(key,msg){if(!canAlert(key))return;logger.warn({alertKey:key},'Health alert');await Promise.allSettled([sendTg(msg),sendDiscord(msg)]);}
async function recovered(key,msg){cooldowns.delete(key);await Promise.allSettled([sendTg(msg),sendDiscord(msg)]);}
function getDiskUsagePercent(dir='/'){try{const{execSync}=require('child_process');const out=execSync(`df -P "${dir}"|tail -1`).toString();return parseInt(out.trim().split(/\s+/)[4],10);}catch{return 0;}}
function getMemoryUsagePercent(){const t=os.totalmem(),f=os.freemem();return Math.round(((t-f)/t)*100);}
module.exports={alert,recovered,getDiskUsagePercent,getMemoryUsagePercent,sendTelegramAlert:sendTg};
