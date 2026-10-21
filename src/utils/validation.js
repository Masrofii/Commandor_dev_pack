'use strict';
const{z}=require('zod');
let safeRegex;try{safeRegex=require('safe-regex2');}catch{safeRegex=()=>true;}
const emailSchema=z.string().email().max(320);
const domainSchema=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/);
function isValidEmail(s){return emailSchema.safeParse(s).success;}
function isValidDomain(s){return domainSchema.safeParse(s).success;}
function sanitizeFilename(fn){if(!fn)return'attachment';return fn.replace(/[^a-zA-Z0-9._\-]/g,'_').replace(/\.{2,}/g,'.').replace(/^\./,'_').slice(0,255);}
function validateRegex(pattern){try{new RegExp(pattern);if(!safeRegex(pattern))throw new Error('Potentially catastrophic regex');return{valid:true};}catch(err){return{valid:false,error:err.message};}}
function safeRegexTest(pattern,input){const{valid}=validateRegex(pattern);if(!valid)return false;try{if(input.length>10000)return false;return new RegExp(pattern,'i').test(input);}catch{return false;}}
// Turns a user-supplied search term into an FTS5-safe phrase token. Strips
// FTS5 operators (" * ( ) : ^ - ...) so hostile input can never be a syntax
// error or a query operator, while keeping prefix-search (`foo*`) working.
function toFtsPhrase(token){const isPrefix=/\*$/.test(token);const cleaned=token.replace(/[^\p{L}\p{N}_]+/gu,' ').trim();if(!cleaned)return null;const phrase=cleaned.split(/\s+/).map(w=>`"${w.replace(/"/g,'""')}"`).join(' ');return isPrefix?phrase.replace(/"$/,'*"'):phrase;}
function parseSearchQuery(query){const f={from:null,subject:null,alias:null,before:null,after:null,tag:null,isUnread:null,isStarred:null,hasAttachment:null,fts:[]};const parts=(query||'').trim().split(/\s+/);for(const p of parts){const[key,...rest]=p.split(':');const val=rest.join(':');switch(key){case'from':f.from=val;break;case'subject':f.subject=val;break;case'alias':f.alias=val;break;case'before':f.before=val;break;case'after':f.after=val;break;case'tag':f.tag=val;break;case'is':if(val==='unread')f.isUnread=true;if(val==='starred')f.isStarred=true;break;case'has':if(val==='attachment')f.hasAttachment=true;break;default:{const phrase=toFtsPhrase(p);if(phrase)f.fts.push(phrase);}}}f.ftsQuery=f.fts.join(' ');return f;}
module.exports={isValidEmail,isValidDomain,sanitizeFilename,validateRegex,safeRegexTest,parseSearchQuery};
