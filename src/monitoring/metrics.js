'use strict';
const{getDb}=require('../../database/database');
const counters={emailsReceived:0,emailsRejected:0,spamBlocked:0,forwardingSuccess:0,forwardingFailed:0,webhookSuccess:0,webhookFailed:0,repliesSent:0,apiRequests:0};
function increment(key,amount=1){if(key in counters)counters[key]+=amount;}
function getCounters(){return{...counters};}
async function getDatabaseStats(){const db=getDb();return{users:db.prepare('SELECT COUNT(*)as c FROM users').get().c,aliases:db.prepare('SELECT COUNT(*)as c FROM aliases WHERE active=1').get().c,emails:db.prepare('SELECT COUNT(*)as c FROM emails WHERE is_deleted=0').get().c,unreadEmails:db.prepare('SELECT COUNT(*)as c FROM emails WHERE is_read=0 AND is_deleted=0').get().c,spamToday:db.prepare("SELECT COUNT(*)as c FROM emails WHERE spam_classification='spam' AND received_at>datetime('now','-1 day')").get().c,emailsToday:db.prepare("SELECT COUNT(*)as c FROM emails WHERE received_at>datetime('now','-1 day')").get().c};}
function getProcessStats(){const m=process.memoryUsage();return{uptime:process.uptime(),memoryRss:m.rss,memoryHeapUsed:m.heapUsed,pid:process.pid,nodeVersion:process.version};}
module.exports={increment,getCounters,getDatabaseStats,getProcessStats};
