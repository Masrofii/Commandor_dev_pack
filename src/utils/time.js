'use strict';
function addMinutes(date,m){return new Date(date.getTime()+m*60000);}
function addDays(date,d){return new Date(date.getTime()+d*86400000);}
function isExpired(dateStr){if(!dateStr)return false;return new Date(dateStr)<new Date();}
module.exports={addMinutes,addDays,isExpired};
