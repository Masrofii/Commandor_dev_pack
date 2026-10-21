'use strict';
const crypto=require('crypto');
function generateAliasLocalPart(len=10){const chars='abcdefghijklmnopqrstuvwxyz0123456789';let r='';const b=crypto.randomBytes(len);for(let i=0;i<len;i++)r+=chars[b[i]%chars.length];return r;}
function formatBytes(b){if(b<1024)return`${b} B`;if(b<1048576)return`${(b/1024).toFixed(1)} KB`;if(b<1073741824)return`${(b/1048576).toFixed(1)} MB`;return`${(b/1073741824).toFixed(2)} GB`;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function truncate(str,max=200){if(!str)return'';return str.length<=max?str:str.slice(0,max)+'…';}
function normalizeSubject(s){if(!s)return'';return s.replace(/^(Re:|Fwd?:|AW:|WG:)\s*/gi,'').replace(/\s+/g,' ').trim();}
function extractDomain(email){const p=email.split('@');return p.length===2?p[1].toLowerCase():null;}
function maskEmail(email){const[local,domain]=email.split('@');if(!domain)return email;const m=local.length<=2?'*'.repeat(local.length):local[0]+'*'.repeat(local.length-2)+local[local.length-1];return`${m}@${domain}`;}
function isSystemAddress(email){const p=[/^(mailer-daemon|postmaster|abuse|noreply|no-reply|bounce|return|auto-reply)/i,/^(donotreply|do-not-reply|daemon|system|support|admin)/i];const l=email.split('@')[0]||'';return p.some(r=>r.test(l));}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function extractVerificationCode(subject = '', text = '') {
  const combined = `${subject || ''}\n${text || ''}`;
  if (!combined.trim()) return null;
  const phraseRegex = /(?:verification\s+code|security\s+code|confirmation\s+code|login\s+code|passcode|one-time\s+password|otp|pin|auth(?:entication)?\s+code)[\s:=—\-]+(G-[0-9]{6}|[A-Z0-9]{4,8}|\d{3}[-\s]\d{3})/i;
  const matchPhrase = combined.match(phraseRegex);
  if (matchPhrase && matchPhrase[1]) return matchPhrase[1].trim();
  const codeIsRegex = /\bcode\s+(?:is|:)\s*(G-[0-9]{6}|[A-Z0-9]{4,8}|\d{3}[-\s]\d{3})\b/i;
  const matchCodeIs = combined.match(codeIsRegex);
  if (matchCodeIs && matchCodeIs[1]) return matchCodeIs[1].trim();
  const subjMatch = (subject || '').match(/\b(\d{4,8})\b/);
  if (subjMatch && /(?:code|otp|verify|verification|pin|passcode|confirm|security)/i.test(subject)) {
    return subjMatch[1];
  }
  if (/(?:verification|verify|security|passcode|one-time|code|confirm|otp|pin)/i.test(combined)) {
    const standaloneMatch = combined.match(/\b([0-9]{6})\b/);
    if (standaloneMatch && standaloneMatch[1]) return standaloneMatch[1];
    const hyphenatedMatch = combined.match(/\b([0-9]{3}[-\s][0-9]{3})\b/);
    if (hyphenatedMatch && hyphenatedMatch[1]) return hyphenatedMatch[1];
  }
  return null;
}

const RESERVED_ALIAS_WORDS = new Set([
  'admin', 'administrator', 'owner', 'root', 'commandor', 'support', 'help',
  'security', 'abuse', 'postmaster', 'hostmaster', 'billing', 'info', 'contact',
  'mail', 'email', 'official', 'staff', 'team', 'system', 'service', 'mod',
  'moderator', 'tempmail', 'bot', 'api', 'dev', 'developer', 'superuser'
]);

function formatCustomAliasLocalPart(rawName, isAdmin = false) {
  if (!rawName || typeof rawName !== 'string') {
    throw new Error('Alias name is required');
  }
  let clean = rawName.trim().toLowerCase().split('@')[0];
  if (!clean) {
    throw new Error('Alias name cannot be empty');
  }

  // Non-admins must strictly end with -ca (e.g. example-ca@commandor.my.id)
  if (!isAdmin && !clean.endsWith('-ca')) {
    clean = `${clean}-ca`;
  }

  const baseName = clean.endsWith('-ca') ? clean.slice(0, -3) : clean;
  if (!baseName) {
    throw new Error('Alias name prefix cannot be empty');
  }

  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(clean) && clean.length > 1) {
    throw new Error('Alias name contains invalid characters. Only lowercase alphanumeric characters, hyphens, dots, or underscores are allowed.');
  }

  if (/(\.\.|__|\-\-)/.test(clean)) {
    throw new Error('Alias name cannot contain consecutive dots, hyphens, or underscores.');
  }

  if (!isAdmin) {
    if (RESERVED_ALIAS_WORDS.has(baseName) || RESERVED_ALIAS_WORDS.has(clean)) {
      throw new Error(`The name "${baseName}" is reserved for system administrators (owner/admin protected).`);
    }
    const criticalWords = ['admin', 'owner', 'root', 'commandor', 'support', 'official', 'system'];
    for (const word of criticalWords) {
      if (baseName === word || baseName.startsWith(`${word}-`) || baseName.endsWith(`-${word}`) || baseName.startsWith(`${word}.`) || baseName.endsWith(`.${word}`)) {
        throw new Error(`The name "${baseName}" contains reserved words (owner/admin protected).`);
      }
    }
  }

  if (clean.length < 3 || clean.length > 35) {
    throw new Error('Alias name must be between 3 and 35 characters long.');
  }

  return clean;
}

module.exports={
  generateAliasLocalPart,
  formatBytes,
  sleep,
  truncate,
  normalizeSubject,
  extractDomain,
  maskEmail,
  isSystemAddress,
  escapeHtml,
  extractVerificationCode,
  formatCustomAliasLocalPart,
  RESERVED_ALIAS_WORDS
};
