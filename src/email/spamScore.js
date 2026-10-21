'use strict';
const config=require('../../config/config');
const INDICATORS=[{p:/\b(viagra|cialis|lottery|winner|prize|claim|million\s*dollar)\b/i,s:2,r:'spam_keyword'},{p:/\b(crypto|bitcoin|investment\s*opportunity)\b/i,s:1,r:'crypto_keyword'},{p:/[A-Z]{10,}/,s:1,r:'excessive_caps'},{p:/!{3,}/,s:1,r:'excessive_exclamation'},{p:/urgent|act now|limited time|expire/i,s:1,r:'urgency'},{p:/click here|click below/i,s:0.5,r:'click_bait'},{p:/verify your (account|email|identity)/i,s:1,r:'phishing_indicator'},{p:/password\s*(reset|expired|expiry)/i,s:1,r:'credential_phishing'},{p:/unsubscribe|opt.?out/i,s:0.5,r:'bulk_indicators'}];
function scoreSpam({subject,textBody,spfResult,dkimResult,dmarcResult,sender}){
  let score=0;const reasons=[];const content=[subject||'',textBody||''].join(' ');
  for(const i of INDICATORS){if(i.p.test(content)){score+=i.s;reasons.push(i.r);}}
  if(spfResult==='fail'){score+=2;reasons.push('spf_fail');}
  else if(spfResult==='softfail'){score+=1;reasons.push('spf_softfail');}
  if(dkimResult==='fail'){score+=2;reasons.push('dkim_fail');}
  if(dmarcResult==='fail'){score+=2;reasons.push('dmarc_fail');}
  if(!spfResult||spfResult==='none'){score+=0.5;reasons.push('no_spf');}
  if(spfResult==='fail'&&dkimResult==='fail'&&dmarcResult==='fail'){score+=2;reasons.push('auth_total_failure');}
  if(sender&&/\d{4,}@/.test(sender)){score+=1;reasons.push('numeric_sender');}
  const classification=score>=config.spam.blockScore?'spam':score>=config.spam.thresholdScore?'suspect':'ham';
  return{score:Math.round(score*10)/10,classification,reasons};
}
module.exports={scoreSpam};
