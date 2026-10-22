'use strict';
const fs = require('fs');
const { getDb } = require('../../database/database');
const config = require('../../config/config');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Account for actual storage backend capacity and fail safely when space is unavailable.
 * Maintains a 50 MB safety margin to prevent filesystem saturation.
 */
function checkStorageBackendCapacity(bytesNeeded = 0) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync('/');
      const freeBytes = stats.bsize * stats.bfree;
      const safetyMargin = 52428800; // 50 MB buffer
      if (freeBytes < bytesNeeded + safetyMargin) {
        throw new Error(`Storage backend disk is critically full (${formatBytes(freeBytes)} free). Cannot accept additional writes.`);
      }
      return {
        available: true,
        freeBytes,
        totalBytes: stats.bsize * stats.blocks
      };
    }
  } catch (err) {
    if (err.message && err.message.includes('critically full')) {
      throw err;
    }
    // If statfs is not supported or directory inaccessible, proceed
  }
  return { available: true };
}

/**
 * Enforce email/message storage quota server-side
 */
function checkEmailStorageQuota(tgId, incomingBytes = 0) {
  checkStorageBackendCapacity(incomingBytes);
  const db = getDb();
  const u = db.prepare('SELECT email_storage_used, email_storage_limit, storage_limit, role FROM users WHERE tg_id = ?').get(tgId);
  if (!u) throw new Error(`User #${tgId} not found`);

  // Admin bypass
  if (u.role === 'admin' || (config.telegram?.adminId && String(tgId) === String(config.telegram.adminId))) {
    return true;
  }

  const limit = (u.email_storage_limit !== undefined && u.email_storage_limit !== null)
    ? u.email_storage_limit
    : (u.storage_limit || 1073741824); // 1 GB fallback

  // 0 or >= 1 TB treated as unlimited
  if (limit === 0 || limit >= 1099511627776) {
    return true;
  }

  const currentUsed = u.email_storage_used || 0;
  if (currentUsed + incomingBytes > limit) {
    throw new Error(`Email storage quota exceeded! Current: ${formatBytes(currentUsed)}, Incoming: ${formatBytes(incomingBytes)}, Quota Limit: ${formatBytes(limit)}.`);
  }

  return true;
}

/**
 * Enforce hosting/website storage quota server-side
 */
function checkHostingStorageQuota(tgId, incomingBytes = 0, replacingSiteId = null) {
  checkStorageBackendCapacity(incomingBytes);
  const db = getDb();
  const u = db.prepare('SELECT hosting_storage_used, hosting_storage_limit, role FROM users WHERE tg_id = ?').get(tgId);
  if (!u) throw new Error(`User #${tgId} not found`);

  // Admin bypass
  if (u.role === 'admin' || (config.telegram?.adminId && String(tgId) === String(config.telegram.adminId))) {
    return true;
  }

  const limit = (u.hosting_storage_limit !== undefined && u.hosting_storage_limit !== null)
    ? u.hosting_storage_limit
    : 5368709120; // 5 GB fallback

  if (limit === 0 || limit >= 1099511627776) {
    return true;
  }

  let effectiveUsed = u.hosting_storage_used || 0;
  if (replacingSiteId) {
    const existing = db.prepare('SELECT storage_used_bytes FROM hosting_sites WHERE id = ? AND tg_id = ?').get(replacingSiteId, tgId);
    if (existing && existing.storage_used_bytes) {
      effectiveUsed = Math.max(0, effectiveUsed - existing.storage_used_bytes);
    }
  }

  if (effectiveUsed + incomingBytes > limit) {
    throw new Error(`Hosting storage quota exceeded! Current: ${formatBytes(effectiveUsed)}, Upload: ${formatBytes(incomingBytes)}, Quota Limit: ${formatBytes(limit)}.`);
  }

  return true;
}

/**
 * Backward-compatible single check
 */
function checkStorageQuota(tgId, add = 0) {
  return checkEmailStorageQuota(tgId, add);
}

/**
 * Separate count-based alias quota check
 */
function checkAliasQuota(tgId) {
  const db = getDb();
  const u = db.prepare('SELECT alias_limit, role FROM users WHERE tg_id = ?').get(tgId);
  const active = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id = ? AND active = 1').get(tgId)?.c || 0;
  const limit = u?.alias_limit || config.quotas.maxAliases || 10;
  const isUnlimited = (u?.role === 'admin' || limit === 0 || limit >= 999999);

  return {
    active,
    limit: isUnlimited ? 0 : limit,
    unlimited: isUnlimited,
    canCreate: isUnlimited || active < limit,
    remaining: isUnlimited ? Infinity : Math.max(0, limit - active),
    percent: isUnlimited ? 0 : Math.min(100, Math.round((active / limit) * 100))
  };
}

/**
 * Detailed breakdown of actual usage, quota, percentage used, and remaining capacity
 * for email storage, website hosting storage, and count-based aliases.
 */
function getUserComprehensiveStorageStats(tgId) {
  const db = getDb();
  const u = db.prepare(`
    SELECT tg_id, role, storage_used, storage_limit,
           email_storage_used, email_storage_limit,
           hosting_storage_used, hosting_storage_limit,
           alias_limit
    FROM users
    WHERE tg_id = ?
  `).get(tgId);

  if (!u) return null;

  const emailUsed = u.email_storage_used || 0;
  const emailLimit = (u.email_storage_limit !== undefined && u.email_storage_limit !== null) ? u.email_storage_limit : 1073741824;
  const emailUnlimited = (u.role === 'admin' || emailLimit === 0 || emailLimit >= 1099511627776);
  const emailRemaining = emailUnlimited ? Infinity : Math.max(0, emailLimit - emailUsed);
  const emailPercent = emailUnlimited ? 0 : (emailLimit > 0 ? Math.round((emailUsed / emailLimit) * 100) : 0);

  const hostingUsed = u.hosting_storage_used || 0;
  const hostingLimit = (u.hosting_storage_limit !== undefined && u.hosting_storage_limit !== null) ? u.hosting_storage_limit : 5368709120;
  const hostingUnlimited = (u.role === 'admin' || hostingLimit === 0 || hostingLimit >= 1099511627776);
  const hostingRemaining = hostingUnlimited ? Infinity : Math.max(0, hostingLimit - hostingUsed);
  const hostingPercent = hostingUnlimited ? 0 : (hostingLimit > 0 ? Math.round((hostingUsed / hostingLimit) * 100) : 0);

  const aliasStats = checkAliasQuota(tgId);

  const totalUsed = emailUsed + hostingUsed;
  const totalLimit = emailLimit + hostingLimit;
  const totalUnlimited = emailUnlimited && hostingUnlimited;
  const totalPercent = totalUnlimited ? 0 : (totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0);
  const totalRemaining = totalUnlimited ? Infinity : Math.max(0, totalLimit - totalUsed);

  return {
    email: {
      usedBytes: emailUsed,
      limitBytes: emailUnlimited ? 0 : emailLimit,
      remainingBytes: emailRemaining,
      usagePercent: emailPercent,
      usedFormatted: formatBytes(emailUsed),
      limitFormatted: emailUnlimited ? 'Unlimited' : formatBytes(emailLimit),
      remainingFormatted: emailUnlimited ? 'Unlimited' : formatBytes(emailRemaining),
      isUnlimited: emailUnlimited,
      isOverQuota: !emailUnlimited && emailUsed > emailLimit
    },
    hosting: {
      usedBytes: hostingUsed,
      limitBytes: hostingUnlimited ? 0 : hostingLimit,
      remainingBytes: hostingRemaining,
      usagePercent: hostingPercent,
      usedFormatted: formatBytes(hostingUsed),
      limitFormatted: hostingUnlimited ? 'Unlimited' : formatBytes(hostingLimit),
      remainingFormatted: hostingUnlimited ? 'Unlimited' : formatBytes(hostingRemaining),
      isUnlimited: hostingUnlimited,
      isOverQuota: !hostingUnlimited && hostingUsed > hostingLimit
    },
    aliases: {
      activeCount: aliasStats.active,
      limitCount: aliasStats.limit,
      remainingCount: aliasStats.remaining,
      usagePercent: aliasStats.percent,
      isUnlimited: aliasStats.unlimited,
      canCreate: aliasStats.canCreate,
      isOverQuota: !aliasStats.unlimited && aliasStats.active > aliasStats.limit
    },
    total: {
      usedBytes: totalUsed,
      limitBytes: totalUnlimited ? 0 : totalLimit,
      remainingBytes: totalRemaining,
      usagePercent: totalPercent,
      usedFormatted: formatBytes(totalUsed),
      limitFormatted: totalUnlimited ? 'Unlimited' : formatBytes(totalLimit),
      remainingFormatted: totalUnlimited ? 'Unlimited' : formatBytes(totalRemaining),
      isUnlimited: totalUnlimited,
      isOverQuota: !totalUnlimited && totalUsed > totalLimit
    }
  };
}

/**
 * Backward-compatible getUserStorageStats
 */
function getUserStorageStats(tgId) {
  const stats = getUserComprehensiveStorageStats(tgId);
  if (!stats) return { used: 0, limit: 0, unlimited: true, available: Infinity, percent: 0 };
  return {
    used: stats.total.usedBytes,
    limit: stats.total.limitBytes,
    unlimited: stats.total.isUnlimited,
    available: stats.total.remainingBytes,
    percent: stats.total.usagePercent,
    email: stats.email,
    hosting: stats.hosting,
    aliases: stats.aliases
  };
}

/**
 * Global storage monitoring and configurable warnings at 80%, 90%, and 95% usage
 */
function getGlobalStorageMetrics(customThresholds = {}) {
  const db = getDb();
  const thresholds = {
    warning: customThresholds.warning || 80,
    high: customThresholds.high || 90,
    critical: customThresholds.critical || 95
  };

  // 1. Physical Host Filesystem Storage
  let disk = {
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    usagePercent: 0,
    totalFormatted: '0 B',
    freeFormatted: '0 B',
    usedFormatted: '0 B'
  };

  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync('/');
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const usedBytes = totalBytes - freeBytes;
      const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
      disk = {
        totalBytes,
        freeBytes,
        usedBytes,
        usagePercent: percent,
        totalFormatted: formatBytes(totalBytes),
        freeFormatted: formatBytes(freeBytes),
        usedFormatted: formatBytes(usedBytes)
      };
    }
  } catch {}

  // 2. Database User Quotas & Allocation
  const agg = db.prepare(`
    SELECT 
      COUNT(*) AS total_users,
      COALESCE(SUM(email_storage_used), 0) AS total_email_used,
      COALESCE(SUM(email_storage_limit), 0) AS total_email_limit,
      COALESCE(SUM(hosting_storage_used), 0) AS total_hosting_used,
      COALESCE(SUM(hosting_storage_limit), 0) AS total_hosting_limit,
      COALESCE(SUM(storage_used), 0) AS total_storage_used,
      COALESCE(SUM(storage_limit), 0) AS total_storage_limit,
      COALESCE(SUM(alias_limit), 0) AS total_alias_limit
    FROM users
  `).get() || {};

  const totalAliasesActive = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE active = 1').get()?.c || 0;
  const overQuotaUsers = db.prepare(`
    SELECT COUNT(*) as c 
    FROM users 
    WHERE (email_storage_limit > 0 AND email_storage_limit < 1099511627776 AND email_storage_used > email_storage_limit)
       OR (hosting_storage_limit > 0 AND hosting_storage_limit < 1099511627776 AND hosting_storage_used > hosting_storage_limit)
  `).get()?.c || 0;

  // 3. Warning Threshold Calculations
  const warnings = [];
  if (disk.usagePercent >= thresholds.critical) {
    warnings.push({
      level: 'critical',
      threshold: thresholds.critical,
      type: 'physical_disk_critical',
      message: `CRITICAL DISK WARNING: Host filesystem storage is ${disk.usagePercent}% full (Only ${disk.freeFormatted} free). New uploads and incoming messages may fail!`
    });
  } else if (disk.usagePercent >= thresholds.high) {
    warnings.push({
      level: 'high',
      threshold: thresholds.high,
      type: 'physical_disk_high',
      message: `HIGH DISK WARNING: Host filesystem storage has reached ${disk.usagePercent}% capacity. Immediate disk expansion or cleanup recommended.`
    });
  } else if (disk.usagePercent >= thresholds.warning) {
    warnings.push({
      level: 'warning',
      threshold: thresholds.warning,
      type: 'physical_disk_elevated',
      message: `NOTICE: Host filesystem storage is at ${disk.usagePercent}% capacity.`
    });
  }

  if (overQuotaUsers > 0) {
    warnings.push({
      level: 'warning',
      threshold: null,
      type: 'users_over_quota',
      message: `${overQuotaUsers} user account(s) have exceeded their allocated storage quotas and require cleanup or quota upgrade.`
    });
  }

  return {
    disk,
    thresholds,
    warnings,
    platform: {
      totalUsers: agg.total_users || 0,
      overQuotaUsers,
      email: {
        usedBytes: agg.total_email_used || 0,
        limitBytes: agg.total_email_limit || 0,
        usedFormatted: formatBytes(agg.total_email_used || 0),
        limitFormatted: formatBytes(agg.total_email_limit || 0),
        usagePercent: agg.total_email_limit > 0 ? Math.round((agg.total_email_used / agg.total_email_limit) * 100) : 0
      },
      hosting: {
        usedBytes: agg.total_hosting_used || 0,
        limitBytes: agg.total_hosting_limit || 0,
        usedFormatted: formatBytes(agg.total_hosting_used || 0),
        limitFormatted: formatBytes(agg.total_hosting_limit || 0),
        usagePercent: agg.total_hosting_limit > 0 ? Math.round((agg.total_hosting_used / agg.total_hosting_limit) * 100) : 0
      },
      aliases: {
        activeCount: totalAliasesActive,
        allocatedCount: agg.total_alias_limit || 0,
        usagePercent: agg.total_alias_limit > 0 ? Math.round((totalAliasesActive / agg.total_alias_limit) * 100) : 0
      }
    }
  };
}

module.exports = {
  formatBytes,
  checkStorageBackendCapacity,
  checkEmailStorageQuota,
  checkHostingStorageQuota,
  checkStorageQuota,
  checkAliasQuota,
  getUserComprehensiveStorageStats,
  getUserStorageStats,
  getGlobalStorageMetrics
};
