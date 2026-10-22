export function extractVerificationCode(subject = '', text = '') {
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

export function detectServiceAndCategory(sender = '', subject = '', text = '') {
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
    { name: 'LinkedIn', pattern: /\blinkedin\b/i }
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

export function summarizeEmail(subject = '', text = '') {
  if (!text && !subject) return '';
  const lines = (text || '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^(unsubscribe|view in browser|terms|privacy|copyright|sent from)/i.test(l));

  if (!lines.length) return subject || '(No text preview)';
  const candidate = lines.find(l => /(?:code|confirm|verify|invoice|order|login|password|thank you|welcome|alert|important|payment)/i.test(l)) || lines[0];
  return candidate.length > 180 ? candidate.slice(0, 180) + '…' : candidate;
}

export function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
