'use strict';
const{simpleParser}=require('mailparser');
const{hashSha256}=require('../utils/crypto');
async function parseEmail(rawEml){
  const parsed=await simpleParser(rawEml,{skipHtmlToText:false,skipTextToHtml:false});
  const from=parsed.from?.value?.[0]||{};
  const sender=from.address?.toLowerCase()||'unknown@unknown';
  const attachments=(parsed.attachments||[]).map(a=>({filename:a.filename||'attachment',contentType:a.contentType,size:a.size,content:a.content,contentId:a.contentId,sha256:hashSha256(a.content)}));
  return{messageId:parsed.messageId||null,inReplyTo:parsed.inReplyTo||null,references:Array.isArray(parsed.references)?parsed.references:[parsed.references].filter(Boolean),sender,senderName:from.name||null,recipient:parsed.to?.value?.[0]?.address?.toLowerCase()||null,replyTo:parsed.replyTo?.value?.[0]?.address?.toLowerCase()||null,subject:parsed.subject||'(no subject)',textBody:parsed.text||null,htmlBody:parsed.html||null,attachments,headers:parsed.headers,date:parsed.date};
}
function extractOriginIp(headers){const r=headers.get?headers.get('received'):null;if(!r)return null;const s=Array.isArray(r)?r[r.length-1]:r;const m=s.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);return m?m[1]:null;}
module.exports={parseEmail,extractOriginIp};
