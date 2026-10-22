'use strict';
const crypto = require('crypto');
const { getDb } = require('../../database/database');
const { setSubscription, getUserDetails } = require('./userService');
const { logChange } = require('./auditLogger');

function generateRandomCode(prefix = 'CMD') {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let random = '';
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${random.substring(0, 4)}-${random.substring(4)}`;
}

function createRedeemCode({
  code,
  title,
  rewardType = 'subscription',
  rewardPlan = 'pro',
  rewardDurationDays = 30,
  rewardStorageBytes = 0,
  rewardAliasCount = 0,
  rewardDomainCount = 0,
  maxUses = 1,
  expiresAt = null,
  adminTgId = null
}) {
  const db = getDb();
  const cleanCode = (code ? String(code).trim().toUpperCase() : generateRandomCode('PRO')).replace(/[^A-Z0-9-]/g, '');

  if (cleanCode.length < 4 || cleanCode.length > 32) {
    throw new Error('Redeem code must be between 4 and 32 characters (letters, numbers, hyphens).');
  }

  const existing = db.prepare('SELECT id FROM redeem_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
  if (existing) {
    throw new Error(`Redeem code "${cleanCode}" already exists.`);
  }

  const cleanTitle = title ? String(title).trim() : `${rewardPlan.toUpperCase()} Developer Pass`;

  const info = db.prepare(`
    INSERT INTO redeem_codes (
      code, title, reward_type, reward_plan, reward_duration_days,
      reward_storage_bytes, reward_alias_count, reward_domain_count,
      max_uses, used_count, expires_at, is_active, created_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, datetime('now'))
  `).run(
    cleanCode,
    cleanTitle,
    rewardType,
    rewardPlan,
    parseInt(rewardDurationDays, 10) || 30,
    parseInt(rewardStorageBytes, 10) || 0,
    parseInt(rewardAliasCount, 10) || 0,
    parseInt(rewardDomainCount, 10) || 0,
    parseInt(maxUses, 10) >= 0 ? parseInt(maxUses, 10) : 1,
    expiresAt ? new Date(expiresAt).toISOString().replace('T', ' ').substring(0, 19) : null,
    adminTgId
  );

  logChange({
    tgId: adminTgId,
    category: 'redeem_codes',
    action: 'code_created',
    details: `Created promo voucher "${cleanCode}" (${cleanTitle})`,
    metadata: { codeId: info.lastInsertRowid, code: cleanCode, rewardType, rewardPlan, maxUses }
  }).catch(() => {});

  return getRedeemCodeById(info.lastInsertRowid);
}

function getRedeemCodeById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM redeem_codes WHERE id = ?').get(id);
}

function listRedeemCodes({ activeOnly = false, search = null } = {}) {
  const db = getDb();
  let q = 'SELECT * FROM redeem_codes WHERE 1=1';
  const params = [];

  if (activeOnly) {
    q += ' AND is_active = 1';
  }

  if (search) {
    q += ' AND (code LIKE ? OR title LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all(...params);
}

function revokeRedeemCode(id, adminTgId = null) {
  const db = getDb();
  const code = db.prepare('SELECT * FROM redeem_codes WHERE id = ?').get(id);
  if (!code) throw new Error(`Redeem code #${id} not found`);

  const nextActive = code.is_active ? 0 : 1;
  db.prepare('UPDATE redeem_codes SET is_active = ? WHERE id = ?').run(nextActive, id);

  logChange({
    tgId: adminTgId,
    category: 'redeem_codes',
    action: nextActive ? 'code_enabled' : 'code_revoked',
    details: `Redeem code "${code.code}" ${nextActive ? 'enabled' : 'revoked'}`,
    metadata: { codeId: id, code: code.code, active: nextActive }
  }).catch(() => {});

  return { success: true, id, is_active: nextActive };
}

function deleteRedeemCode(id, adminTgId = null) {
  const db = getDb();
  const code = db.prepare('SELECT * FROM redeem_codes WHERE id = ?').get(id);
  if (!code) return false;

  db.prepare('DELETE FROM redeem_codes WHERE id = ?').run(id);

  logChange({
    tgId: adminTgId,
    category: 'redeem_codes',
    action: 'code_deleted',
    details: `Deleted redeem code "${code.code}"`,
    metadata: { codeId: id, code: code.code }
  }).catch(() => {});

  return true;
}

/**
 * Redeem code on behalf of a user
 */
async function redeemCodeForUser(rawCode, tgId, { ipAddress = null } = {}) {
  if (!rawCode || typeof rawCode !== 'string') {
    throw new Error('Please enter a valid redeem code.');
  }

  const cleanCode = rawCode.trim().toUpperCase();
  const db = getDb();

  // 1. Fetch user
  const user = db.prepare('SELECT tg_id, username, is_banned, subscription_plan, subscription_expires_at FROM users WHERE tg_id = ?').get(tgId);
  if (!user) throw new Error('User not found.');
  if (user.is_banned) throw new Error('Suspended accounts cannot redeem voucher codes.');

  // 2. Fetch code
  const codeRecord = db.prepare('SELECT * FROM redeem_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
  if (!codeRecord) {
    throw new Error(`Voucher code "${cleanCode}" is invalid or does not exist.`);
  }

  if (!codeRecord.is_active) {
    throw new Error('This voucher code has been deactivated.');
  }

  // 3. Expiration check
  if (codeRecord.expires_at) {
    const expDate = new Date(codeRecord.expires_at);
    if (expDate.getTime() < Date.now()) {
      throw new Error(`This voucher code expired on ${expDate.toLocaleDateString()}.`);
    }
  }

  // 4. Max uses check
  if (codeRecord.max_uses > 0 && codeRecord.used_count >= codeRecord.max_uses) {
    throw new Error('This voucher code has reached its maximum redemption limit.');
  }

  // 5. User duplicate check (one redemption per user per code)
  const alreadyRedeemed = db.prepare('SELECT id, redeemed_at FROM redeem_logs WHERE code_id = ? AND tg_id = ?').get(codeRecord.id, tgId);
  if (alreadyRedeemed) {
    throw new Error(`You have already redeemed this voucher code on ${new Date(alreadyRedeemed.redeemed_at).toLocaleDateString()}.`);
  }

  // 6. Apply Reward
  let rewardSummary = '';
  if (codeRecord.reward_type === 'subscription') {
    const updated = setSubscription(tgId, {
      planId: codeRecord.reward_plan || 'pro',
      durationDays: codeRecord.reward_duration_days || 30,
      adminTgId: null,
      ipAddress
    });
    rewardSummary = `${codeRecord.title} — ${codeRecord.reward_plan.toUpperCase()} Tier granted for ${codeRecord.reward_duration_days} days (Expires: ${new Date(updated.subscription_expires_at).toLocaleDateString()})`;
  } else if (codeRecord.reward_type === 'storage_boost') {
    const addBytes = codeRecord.reward_storage_bytes || 1073741824;
    db.prepare('UPDATE users SET storage_limit = storage_limit + ? WHERE tg_id = ?').run(addBytes, tgId);
    rewardSummary = `Storage capacity increased by ${(addBytes / 1024 / 1024).toFixed(0)} MB`;
  } else if (codeRecord.reward_type === 'alias_boost') {
    const addAliases = codeRecord.reward_alias_count || 10;
    db.prepare('UPDATE users SET alias_limit = alias_limit + ? WHERE tg_id = ?').run(addAliases, tgId);
    rewardSummary = `Alias limit increased by +${addAliases} aliases`;
  } else if (codeRecord.reward_type === 'domain_boost') {
    const addDomains = codeRecord.reward_domain_count || 2;
    db.prepare('UPDATE users SET custom_domain_limit = custom_domain_limit + ? WHERE tg_id = ?').run(addDomains, tgId);
    rewardSummary = `Custom domain allowance increased by +${addDomains} domains`;
  }

  // 7. Update usage count & insert log
  db.prepare('UPDATE redeem_codes SET used_count = used_count + 1 WHERE id = ?').run(codeRecord.id);
  db.prepare(`
    INSERT INTO redeem_logs (code_id, code, tg_id, reward_summary, ip_address, redeemed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(codeRecord.id, codeRecord.code, tgId, rewardSummary, ipAddress);

  logChange({
    tgId,
    category: 'redeem_codes',
    action: 'code_redeemed',
    details: `User @${user.username || tgId} redeemed code "${codeRecord.code}": ${rewardSummary}`,
    metadata: { codeId: codeRecord.id, code: codeRecord.code, rewardSummary, ipAddress }
  }).catch(() => {});

  return {
    success: true,
    code: codeRecord.code,
    title: codeRecord.title,
    rewardType: codeRecord.reward_type,
    rewardSummary,
    user: getUserDetails(tgId)
  };
}

function listRedeemLogs({ limit = 50 } = {}) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT 
      l.*,
      u.username, u.first_name, u.role
    FROM redeem_logs l
    LEFT JOIN users u ON l.tg_id = u.tg_id
    ORDER BY l.redeemed_at DESC
    LIMIT ?
  `).all(parseInt(limit, 10));

  return rows;
}

module.exports = {
  createRedeemCode,
  getRedeemCodeById,
  listRedeemCodes,
  revokeRedeemCode,
  deleteRedeemCode,
  redeemCodeForUser,
  listRedeemLogs
};
