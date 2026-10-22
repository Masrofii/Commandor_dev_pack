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

  // 1. Explicit "code is: 123456" or "code: 123456" or "code is 123456"
  const codeIsRegex = /(?:code|otp|pin|password|passcode)\s+(?:is|:|=)\s*([A-Za-z0-9-]{4,10})/i;
  const matchCodeIs = combined.match(codeIsRegex);
  if (matchCodeIs && matchCodeIs[1]) {
    const val = matchCodeIs[1].trim();
    if (/\d/.test(val) && !/^(this|that|here|valid|your|email)$/i.test(val)) return val;
  }

  // 2. Specific phrase like "verification code: 123456" on the same line
  const phraseRegex = /(?:verification\s+code|security\s+code|confirmation\s+code|login\s+code|one-time\s+password|auth(?:entication)?\s+code)[^\S\r\n]*[:=—\-]+[^\S\r\n]*(G-[0-9]{6}|\d{3}[-\s]\d{3}|\d{4,8}|(?=[A-Z0-9]*\d)[A-Z0-9]{4,8})/i;
  const matchPhrase = combined.match(phraseRegex);
  if (matchPhrase && matchPhrase[1]) return matchPhrase[1].trim();

  // 3. Subject contains 4-8 digit code
  const subjMatch = (subject || '').match(/\b(\d{4,8})\b/);
  if (subjMatch && /(?:code|otp|verify|verification|pin|passcode|confirm|security)/i.test(subject)) {
    return subjMatch[1];
  }

  // 4. Standalone 6-digit code in text if context contains verification keywords
  if (/(?:verification|verify|security|passcode|one-time|code|confirm|otp|pin)/i.test(combined)) {
    const standaloneMatch = combined.match(/\b([0-9]{6})\b/);
    if (standaloneMatch && standaloneMatch[1]) return standaloneMatch[1];
    const hyphenatedMatch = combined.match(/\b([0-9]{3}[-\s][0-9]{3})\b/);
    if (hyphenatedMatch && hyphenatedMatch[1]) return hyphenatedMatch[1];
    const generalMatch = combined.match(/\b([0-9]{4,8})\b/);
    if (generalMatch && generalMatch[1]) return generalMatch[1];
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

function formatTelegramEntitiesToHtml(text, entities) {
  if (!text) return '';
  if (!entities || !Array.isArray(entities) || entities.length === 0) {
    return escapeHtml(text);
  }

  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
  let result = '';
  let cursor = 0;

  for (const entity of sorted) {
    const { offset, length, type } = entity;
    if (offset < cursor) continue;
    if (offset > cursor) {
      result += escapeHtml(text.slice(cursor, offset));
    }
    const rawSpan = text.slice(offset, offset + length);
    const escapedSpan = escapeHtml(rawSpan);

    switch (type) {
      case 'bold':
        result += `<b>${escapedSpan}</b>`;
        break;
      case 'italic':
        result += `<i>${escapedSpan}</i>`;
        break;
      case 'underline':
        result += `<u>${escapedSpan}</u>`;
        break;
      case 'strikethrough':
        result += `<s>${escapedSpan}</s>`;
        break;
      case 'code':
        result += `<code>${escapedSpan}</code>`;
        break;
      case 'pre':
        result += `<pre>${escapedSpan}</pre>`;
        break;
      case 'spoiler':
        result += `<tg-spoiler>${escapedSpan}</tg-spoiler>`;
        break;
      case 'text_link':
        result += `<a href="${escapeHtml(entity.url || '')}">${escapedSpan}</a>`;
        break;
      default:
        result += escapedSpan;
    }
    cursor = offset + length;
  }

  if (cursor < text.length) {
    result += escapeHtml(text.slice(cursor));
  }
  return result;
}

function detectServiceAndCategory(sender = '', subject = '', text = '') {
  const combined = `${sender || ''} ${subject || ''} ${text || ''}`.toLowerCase();
  const services = [
    { name: 'Google', pattern: /\b(google|gmail|youtube)\b/i },
    { name: 'GitHub', pattern: /\bgithub\b/i },
    { name: 'Discord', pattern: /\bdiscord\b/i },
    { name: 'Steam', pattern: /\b(steam|steampowered|valve)\b/i },
    { name: 'Telegram', pattern: /\btelegram\b/i },
    { name: 'Twitter / X', pattern: /\b(twitter|x\.com)\b/i },
    { name: 'Amazon', pattern: /\b(amazon|aws)\b/i },
    { name: 'Microsoft', pattern: /\b(microsoft|azure|outlook|xbox)\b/i },
    { name: 'Apple', pattern: /\b(apple|icloud)\b/i },
    { name: 'PayPal', pattern: /\bpaypal\b/i },
    { name: 'Stripe', pattern: /\bstripe\b/i },
    { name: 'OpenAI', pattern: /\b(openai|chatgpt)\b/i },
    { name: 'Netflix', pattern: /\bnetflix\b/i },
    { name: 'Spotify', pattern: /\bspotify\b/i },
    { name: 'Instagram', pattern: /\binstagram\b/i },
    { name: 'Facebook', pattern: /\b(facebook|meta)\b/i },
    { name: 'TikTok', pattern: /\btiktok\b/i },
    { name: 'Reddit', pattern: /\breddit\b/i },
    { name: 'LinkedIn', pattern: /\blinkedin\b/i },
    { name: 'Uber', pattern: /\buber\b/i },
    { name: 'Coinbase', pattern: /\bcoinbase\b/i },
    { name: 'Binance', pattern: /\bbinance\b/i }
  ];

  let detectedService = null;
  for (const s of services) {
    if (s.pattern.test(combined)) {
      detectedService = s.name;
      break;
    }
  }

  const otp = extractVerificationCode(subject, text);
  let category = 'personal';

  if (otp) {
    category = 'otp';
  } else if (/password|reset|security alert|login from|suspicious|unauthorized|2fa|authenticator/i.test(subject + text)) {
    category = 'security';
  } else if (/receipt|invoice|order\s+#|payment received|billing|subscription|purchase|charged/i.test(subject + text)) {
    category = 'receipt';
  } else if (/newsletter|unsubscribe|digest|weekly update|promotions|marketing/i.test(subject + text)) {
    category = 'newsletter';
  }

  let expiresEstimate = null;
  if (otp) {
    const expMatch = text.match(/valid (?:for|within)\s*(\d+)\s*(minute|min|hour|second)s?/i);
    if (expMatch) {
      expiresEstimate = `~${expMatch[1]} ${expMatch[2]}`;
    } else {
      expiresEstimate = '~10 minutes';
    }
  }

  return {
    service: detectedService,
    category,
    otp,
    expiresEstimate
  };
}

function summarizeEmail(subject = '', text = '') {
  if (!text && !subject) return '';
  const lines = (text || '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^(unsubscribe|view in browser|terms|privacy|copyright|sent from)/i.test(l));

  if (!lines.length) return subject || '(No text preview)';

  // Find sentences with action items or core info
  const candidate = lines.find(l => /(?:code|confirm|verify|invoice|order|login|password|thank you|welcome|alert|important|payment)/i.test(l)) || lines[0];
  return truncate(candidate, 180);
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
  formatTelegramEntitiesToHtml,
  extractVerificationCode,
  detectServiceAndCategory,
  summarizeEmail,
  formatCustomAliasLocalPart,
  RESERVED_ALIAS_WORDS
};
