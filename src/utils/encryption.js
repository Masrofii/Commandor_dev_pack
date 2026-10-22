'use strict';
const crypto = require('crypto');

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'commandor-dev-pack-secure-default-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
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
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Return raw text if not encrypted in expected format (backward compatibility)
    return encryptedText;
  }
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, return null or throw
    return null;
  }
}

/**
 * Mask a secret for UI / API responses (e.g. "sk-abc...1234")
 */
function maskSecret(secret, visiblePrefix = 4, visibleSuffix = 4) {
  if (!secret || typeof secret !== 'string') return '••••••••';
  if (secret.length <= (visiblePrefix + visibleSuffix)) {
    return '••••••••';
  }
  return `${secret.slice(0, visiblePrefix)}••••••••${secret.slice(-visibleSuffix)}`;
}

module.exports = {
  encrypt,
  decrypt,
  maskSecret
};
