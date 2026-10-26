'use strict';
const crypto = require('crypto');
const config = require('../../config/config');

let cachedKey = null;
let cachedSecret = null;

function resolveSecret() {
  const explicit = process.env.ENCRYPTION_KEY || config.encryption?.key;
  if (explicit) return explicit;

  if (config.isProduction) {
    throw new Error(
      'ENCRYPTION_KEY is not configured. Refusing to start with an insecure default key. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Development and test environments may run without an explicit key. The
  // derived key is deterministic so local data remains readable across
  // restarts, but it is never used in production.
  return 'development-only-encryption-key-do-not-use-in-production';
}

function getEncryptionKey() {
  const secret = resolveSecret();
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedSecret = secret;
  cachedKey = crypto.createHash('sha256').update(secret).digest();
  return cachedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex)
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(String(plaintext), 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${ciphertext}`;
}

/**
 * Decrypt a ciphertext produced by encrypt().
 * Returns null when the payload cannot be authenticated with the active key.
 * Legacy plaintext values (without the iv:tag:ciphertext shape) are returned
 * unchanged for backward compatibility with records written by older builds.
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3 || !/^[0-9a-f]+$/i.test(parts[0]) || !/^[0-9a-f]+$/i.test(parts[1])) {
    return encryptedText;
  }
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
}

/**
 * Mask a secret for UI / API responses (e.g. "sk-abc...1234")
 */
function maskSecret(secret, visiblePrefix = 4, visibleSuffix = 4) {
  if (!secret || typeof secret !== 'string') return '••••••••';
  if (secret.length <= visiblePrefix + visibleSuffix) {
    return '••••••••';
  }
  return `${secret.slice(0, visiblePrefix)}••••••••${secret.slice(-visibleSuffix)}`;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  maskSecret
};
