'use strict';
function processAuthHeaders(headers){
  const res={spf:'none',dkim:'none',dmarc:'none'};
  const auth=(headers.get?headers.get('authentication-results'):null)||'';
  const s=Array.isArray(auth)?auth.join(' '):auth;
  const spf=s.match(/spf=(\w+)/i);if(spf)res.spf=spf[1].toLowerCase();
  const dkim=s.match(/dkim=(\w+)/i);if(dkim)res.dkim=dkim[1].toLowerCase();
  const dmarc=s.match(/dmarc=(\w+)/i);if(dmarc)res.dmarc=dmarc[1].toLowerCase();
  const rspf=headers.get?headers.get('received-spf'):null;
  if(rspf&&res.spf==='none'){const m=rspf.match(/^(\w+)/i);if(m)res.spf=m[1].toLowerCase();}
  return res;
}
module.exports={processAuthHeaders};
