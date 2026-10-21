export function extractVerificationCode(subject = '', text = '') {
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
