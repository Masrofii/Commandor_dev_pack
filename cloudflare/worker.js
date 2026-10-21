/**
 * Cloudflare Email Worker
 * Deploy: wrangler deploy
 * Env vars: BACKEND_URL, INCOMING_SECRET
 */
export default {
  async email(message,env,ctx){
    const{from,to,raw,headers}=message;
    if(!env.BACKEND_URL||!env.INCOMING_SECRET){console.error('Missing config');message.setReject('Configuration error');return;}
    let rawEmail;
    try{rawEmail=await streamToArrayBuffer(raw);}catch(err){console.error('Failed to read email:',err);message.setReject('Failed to read email');return;}
    const authStr=headers.get('Authentication-Results')||'';
    const spf=extractResult(authStr,'spf');
    const dkim=extractResult(authStr,'dkim');
    const dmarc=extractResult(authStr,'dmarc');
    const received=headers.get('Received')||'';
    const ipMatch=received.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
    const originIp=ipMatch?ipMatch[1]:'';
    try{
      const response=await fetch(`${env.BACKEND_URL}/api/incoming`,{method:'POST',headers:{'Content-Type':'message/rfc822','X-Incoming-Secret':env.INCOMING_SECRET,'X-Email-To':to,'X-Email-From':from,'X-Origin-IP':originIp,'X-SPF-Result':spf,'X-DKIM-Result':dkim,'X-DMARC-Result':dmarc,'X-CF-Worker':'1'},body:rawEmail});
      if(!response.ok){const text=await response.text().catch(()=>'unknown');console.error(`Backend rejected: ${response.status} ${text}`);if(response.status>=500){message.setReject(`Backend error: ${response.status}`);return;}}
      console.log(`Email for ${to} accepted`);
    }catch(err){console.error('Failed to forward:',err);message.setReject('Failed to process email');}
  }
};
function extractResult(s,p){const m=s.match(new RegExp(`${p}=(\\w+)`,'i'));return m?m[1].toLowerCase():'none';}
async function streamToArrayBuffer(stream){const r=stream.getReader();const chunks=[];let total=0;while(true){const{done,value}=await r.read();if(done)break;chunks.push(value);total+=value.length;}const result=new Uint8Array(total);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result.buffer;}
