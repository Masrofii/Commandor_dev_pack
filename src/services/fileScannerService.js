'use strict';
const AdmZip = require('adm-zip');
const { getDb } = require('../../database/database');
const logger = require('../monitoring/logger');

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.vbs', '.ps1', '.elf', '.bin', '.so', '.pl', '.cgi', '.sh', '.msi', '.apk', '.jar'
]);

const MALWARE_PATTERNS = [
  {
    type: 'crypto_miner',
    name: 'Cryptocurrency Miner Signature',
    regex: /(xmrig|stratum\+tcp|cryptonight|minergate|coinhive|crypto-loot|supportxmr|moneroocean|pool\.minexmr\.com|nanopool\.org:)/i
  },
  {
    type: 'webshell',
    name: 'Webshell / Backdoor Signature',
    regex: /(c99shell|r57shell|b374k|wso_shell|alfa_shell|weevely|passthru\s*\(|shell_exec\s*\(|eval\s*\(\s*base64_decode|\/bin\/bash\s+-i|\/bin\/sh\s+-i|nc\s+-e\s+\/bin)/i
  },
  {
    type: 'reverse_shell',
    name: 'Reverse Shell / Remote Command Execution',
    regex: /(subprocess\.Popen\s*\(\s*['"]\/bin\/(sh|bash)|os\.system\s*\(\s*['"]nc\s+-e|socket\.socket\(\)\.connect|bash\s+-c\s+['"]bash\s+-i)/i
  },
  {
    type: 'ddos_flooder',
    name: 'DDoS / Network Flooder Tool',
    regex: /(synflood|udpflood|slowloris|packet_crafter|botnet_worker)/i
  },
  {
    type: 'credential_stealer',
    name: 'Discord / Telegram Credential Harvester',
    regex: /(api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+|api\.telegram\.org\/bot[0-9a-zA-Z:_-]+\/sendMessage).*?(password|mnemonic|private_key|seed_phrase|keystore)/is
  },
  {
    type: 'phishing_crypto',
    name: 'Crypto Wallet Phishing Template',
    regex: /(12-word recovery phrase|input your private key|import your metamask wallet|trust wallet recovery)/i
  }
];

function checkExtension(filename) {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const ext = filename.slice(dotIdx).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return ext;
  }
  return null;
}

function scanContent(filename, text) {
  if (!text || typeof text !== 'string') return null;

  for (const rule of MALWARE_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        type: rule.type,
        name: rule.name,
        file: filename,
        pattern: rule.regex.source.slice(0, 80)
      };
    }
  }
  return null;
}

function scanFiles(files = []) {
  const violations = [];

  for (const f of files) {
    const filename = f.name || f.path || 'unknown';
    const blockedExt = checkExtension(filename);
    if (blockedExt) {
      violations.push({
        file: filename,
        threat: 'blocked_extension',
        name: `Disallowed dangerous executable extension: ${blockedExt}`,
        pattern: blockedExt
      });
      continue;
    }

    const content = typeof f.content === 'string' ? f.content : (Buffer.isBuffer(f.content) ? f.content.toString('utf8', 0, Math.min(f.content.length, 500000)) : '');
    const detected = scanContent(filename, content);
    if (detected) {
      violations.push({
        file: filename,
        threat: detected.type,
        name: detected.name,
        pattern: detected.pattern
      });
    }
  }

  return {
    safe: violations.length === 0,
    violations
  };
}

function scanZipBuffer(zipBuffer) {
  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const files = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // Skip Mac OSX metadata
      if (entry.entryName.startsWith('__MACOSX/') || entry.entryName.endsWith('.DS_Store')) continue;

      const content = entry.getData().toString('utf8', 0, 300000);
      files.push({
        name: entry.entryName,
        content
      });
    }

    return scanFiles(files);
  } catch (err) {
    logger.warn({ err: err.message }, 'ZIP extraction error during scan');
    return {
      safe: false,
      violations: [{ file: 'archive.zip', threat: 'corrupt_archive', name: 'Invalid or corrupt ZIP archive', pattern: err.message }]
    };
  }
}

function logSecurityViolation(tgId, { siteId = null, threatType, fileName, matchedPattern, ipAddress = null }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO hosting_security_logs (tg_id, site_id, threat_type, file_name, matched_pattern, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(tgId, siteId, threatType, fileName, String(matchedPattern || ''), ipAddress);

    logger.warn({ tgId, threatType, fileName, pattern: matchedPattern }, 'Security violation blocked and recorded');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to record security violation log');
  }
}

module.exports = {
  BLOCKED_EXTENSIONS,
  MALWARE_PATTERNS,
  scanFiles,
  scanZipBuffer,
  logSecurityViolation
};
