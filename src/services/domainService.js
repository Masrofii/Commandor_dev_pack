'use strict';
const dns=require('dns').promises;
const{getDb}=require('../../database/database');
const{generateVerificationToken}=require('../utils/crypto');
const{isValidDomain}=require('../utils/validation');
const logger=require('../monitoring/logger');
function getUserDomains(tgId){return getDb().prepare('SELECT * FROM custom_domains WHERE tg_id=? ORDER BY created_at DESC').all(tgId);}
function addDomain(tgId,domain){if(!isValidDomain(domain))throw new Error('Invalid domain format');const db=getDb();const e=db.prepare('SELECT * FROM custom_domains WHERE domain=?').get(domain);if(e&&e.tg_id!==tgId)throw new Error('Domain already registered by another user');if(e)return e;const token=generateVerificationToken();db.prepare('INSERT INTO custom_domains(tg_id,domain,verification_token)VALUES(?,?,?)').run(tgId,domain,token);return db.prepare('SELECT * FROM custom_domains WHERE domain=?').get(domain);}
async function verifyDomain(d){
  const db=getDb();
  try{
    const records=await dns.resolveTxt(d.domain);
    const flat=records.map(r=>r.join('')).flat();
    const found=flat.some(r=>r.includes(d.verification_token));
    db.prepare("UPDATE custom_domains SET dns_checked_at=datetime('now')WHERE id=?").run(d.id);
    if(found){
      db.prepare("UPDATE custom_domains SET verified=1,verified_at=datetime('now'),active=1 WHERE id=?").run(d.id);
      const health = await checkDomainDnsHealth(d.domain, d.verification_token);
      return{verified:true, health};
    }
    return{verified:false,message:'TXT verification record not found in DNS.'};
  }catch(err){
    return{verified:false,message:`DNS resolution failed: ${err.message}`};
  }
}

async function checkDomainDnsHealth(domain, verificationToken = null) {
  const result = {
    domain,
    ownership: { status: 'unknown', record: null, message: '' },
    mx: { status: 'unknown', records: [], message: '' },
    spf: { status: 'unknown', record: null, message: '' },
    dmarc: { status: 'unknown', record: null, message: '' },
    overallStatus: 'pending'
  };

  try {
    const txts = await dns.resolveTxt(domain);
    const flat = txts.map(r => r.join('')).flat();
    if (verificationToken) {
      const foundToken = flat.some(r => r.includes(verificationToken));
      result.ownership = {
        status: foundToken ? 'verified' : 'missing',
        record: flat.find(r => r.includes(verificationToken)) || null,
        message: foundToken ? 'Verification token found.' : `Missing TXT token: ${verificationToken}`
      };
    } else {
      result.ownership = { status: 'verified', record: null, message: 'Verified' };
    }

    const spfRecord = flat.find(r => r.startsWith('v=spf1'));
    if (spfRecord) {
      result.spf = { status: 'valid', record: spfRecord, message: 'Valid SPF record detected.' };
    } else {
      result.spf = { status: 'missing', record: null, message: 'No SPF record found (v=spf1). Recommended: "v=spf1 mx ~all"' };
    }
  } catch (err) {
    result.ownership = { status: 'missing', record: null, message: `DNS lookup failed: ${err.message}` };
    result.spf = { status: 'missing', record: null, message: 'No TXT records found.' };
  }

  try {
    const mxs = await dns.resolveMx(domain);
    if (mxs && mxs.length > 0) {
      mxs.sort((a, b) => a.priority - b.priority);
      result.mx = {
        status: 'valid',
        records: mxs,
        message: `${mxs.length} MX record(s) resolved (Primary: ${mxs[0].exchange})`
      };
    } else {
      result.mx = { status: 'missing', records: [], message: 'No MX records found. Incoming email will not be routed.' };
    }
  } catch (err) {
    result.mx = { status: 'missing', records: [], message: `MX resolution failed: ${err.message}` };
  }

  try {
    const dmarcTxts = await dns.resolveTxt(`_dmarc.${domain}`);
    const flatDmarc = dmarcTxts.map(r => r.join('')).flat();
    const dmarcRec = flatDmarc.find(r => r.startsWith('v=DMARC1'));
    if (dmarcRec) {
      result.dmarc = { status: 'valid', record: dmarcRec, message: 'DMARC policy found.' };
    } else {
      result.dmarc = { status: 'warning', record: null, message: 'No DMARC record at _dmarc.' + domain + '. Recommended: "v=DMARC1; p=none;"' };
    }
  } catch {
    result.dmarc = { status: 'warning', record: null, message: 'No DMARC record found at _dmarc.' + domain };
  }

  if (result.ownership.status === 'verified' && result.mx.status === 'valid') {
    result.overallStatus = (result.spf.status === 'valid' && result.dmarc.status === 'valid') ? 'healthy' : 'warning';
  } else {
    result.overallStatus = 'misconfigured';
  }

  return result;
}

function deleteDomain(id,tgId){return getDb().prepare('DELETE FROM custom_domains WHERE id=? AND tg_id=?').run(id,tgId).changes>0;}
module.exports={getUserDomains,addDomain,verifyDomain,deleteDomain,checkDomainDnsHealth};
