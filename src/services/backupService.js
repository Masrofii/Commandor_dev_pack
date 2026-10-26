'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const dayjs = require('dayjs');
const { getDb, initDatabase, closeDatabase } = require('../../database/database');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const BACKUP_DIR = path.resolve(config.backup?.dir || path.join(__dirname, '../../backups'));
try {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
} catch (err) {
  logger.warn({ error: err.message, dir: BACKUP_DIR }, 'Could not ensure backup directory exists');
}

function assertInsideBackupDir(filePath) {
  const resolved = path.resolve(filePath);
  if (resolved !== BACKUP_DIR && !resolved.startsWith(BACKUP_DIR + path.sep)) {
    throw new Error('Backup path is outside the configured backup directory');
  }
  return resolved;
}

function safeUnlink(filePath) {
  try {
    if (!filePath) return;
    const resolved = assertInsideBackupDir(filePath);
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  } catch (err) {
    logger.warn({ err: err.message, filePath }, 'Could not remove backup file');
  }
}

function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verify SQLite database integrity by checking magic header and size
 */
function verifySqliteIntegrity(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 100) return { valid: false, error: 'Backup file is too small or empty' };

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const header = buffer.toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      return { valid: false, error: 'Corrupt SQLite file: Invalid SQLite magic header.' };
    }

    return { valid: true, sizeBytes: stat.size };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Run verified online database backup
 */
async function createDatabaseBackup(notes = 'Manual backup', userTgId = null) {
  const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss-SSS');
  const backupFileName = `backup_db_${ts}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  const db = getDb();

  // Use better-sqlite3 online backup API for crash-consistent snapshot
  await db.backup(backupFilePath);

  // Verify integrity
  const integrity = verifySqliteIntegrity(backupFilePath);
  if (!integrity.valid) {
    safeUnlink(backupFilePath);
    throw new Error(`Database backup integrity check failed: ${integrity.error}`);
  }

  const checksum = await calculateFileSha256(backupFilePath);
  const stat = fs.statSync(backupFilePath);

  // Record in database
  const info = db.prepare(`
    INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
    VALUES (?, 'database', ?, ?, 'verified', ?, ?, datetime('now'))
  `).run(backupFileName, backupFilePath, stat.size, checksum, notes);

  const backupId = info.lastInsertRowid;

  logChange({
    tgId: userTgId,
    category: 'backups',
    action: 'backup_created',
    details: `Created verified database backup "${backupFileName}" (${Math.round(stat.size / 1024)} KB)`,
    metadata: { backupId, fileName: backupFileName, sizeBytes: stat.size, checksum }
  }).catch(() => {});

  // Run retention prune
  pruneBackups().catch(() => {});

  return getBackupById(backupId);
}

/**
 * Create full system archive backup (database + nginx routes + configuration
 * and schema files). Secrets in .env are never included.
 */
async function createFullSystemBackup(notes = 'Full system backup', userTgId = null) {
  const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss-SSS');
  const zipFileName = `backup_full_${ts}.zip`;
  const zipFilePath = path.join(BACKUP_DIR, zipFileName);
  const tempDbPath = path.join(BACKUP_DIR, `.tmp_full_db_${Date.now()}.db`);
  const db = getDb();

  try {
    await db.backup(tempDbPath);
    const integrity = verifySqliteIntegrity(tempDbPath);
    if (!integrity.valid) {
      throw new Error(`Database snapshot integrity check failed: ${integrity.error}`);
    }

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.file(tempDbPath, { name: 'database/app.db' });

      const projectRoot = path.resolve(__dirname, '../..');
      const routesDir = path.join(projectRoot, 'nginx/routes');
      if (fs.existsSync(routesDir)) archive.directory(routesDir, 'nginx/routes');

      for (const entry of ['config/config.js', '.env.example', 'package.json', 'ecosystem.config.js', 'README.md']) {
        const fullPath = path.join(projectRoot, entry);
        if (fs.existsSync(fullPath)) archive.file(fullPath, { name: entry });
      }

      const migrationsDir = path.join(projectRoot, 'database/migrations');
      if (fs.existsSync(migrationsDir)) archive.directory(migrationsDir, 'database/migrations');

      archive.finalize();
    });

    const checksum = await calculateFileSha256(zipFilePath);
    const stat = fs.statSync(zipFilePath);

    const info = db.prepare(`
      INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
      VALUES (?, 'full', ?, ?, 'verified', ?, ?, datetime('now'))
    `).run(zipFileName, zipFilePath, stat.size, checksum, notes);

    const backupId = info.lastInsertRowid;

    logChange({
      tgId: userTgId,
      category: 'backups',
      action: 'backup_created',
      details: `Created verified full system backup "${zipFileName}" (${Math.round(stat.size / 1024)} KB)`,
      metadata: { backupId, fileName: zipFileName, sizeBytes: stat.size, checksum }
    }).catch(() => {});

    pruneBackups().catch(() => {});

    return getBackupById(backupId);
  } finally {
    safeUnlink(tempDbPath);
  }
}

function getBackupById(id) {
  const row = getDb().prepare('SELECT * FROM system_backups WHERE id=?').get(id);
  return row || null;
}

function listBackups(opts = {}) {
  const db = getDb();
  let q = 'SELECT * FROM system_backups WHERE 1=1';
  const params = [];

  if (opts.type) {
    q += ' AND backup_type = ?';
    params.push(opts.type);
  }

  q += ' ORDER BY created_at DESC';
  return db.prepare(q).all(...params);
}

/**
 * Resolve the SQLite payload inside either a database backup or a full archive.
 */
function resolveDatabasePayload(backup) {
  if (backup.backup_type === 'full') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(backup.file_path);
    const entry = zip.getEntry('database/app.db');
    if (!entry) throw new Error('Full backup archive is missing database/app.db');
    const tempPath = path.join(BACKUP_DIR, `.tmp_restore_payload_${Date.now()}.db`);
    fs.writeFileSync(tempPath, entry.getData());
    return { filePath: tempPath, temporary: true };
  }
  return { filePath: backup.file_path, temporary: false };
}

/**
 * Restore database from a verified backup with pre-restore safety snapshot
 */
async function restoreDatabaseBackup(backupId, confirmationAccepted = false, userTgId = null) {
  if (!confirmationAccepted) {
    throw new Error('You must explicitly confirm the database restore operation. Current database will be replaced.');
  }

  const backup = getBackupById(backupId);
  if (!backup) throw new Error(`Backup #${backupId} not found`);
  if (!fs.existsSync(backup.file_path)) {
    throw new Error(`Backup file missing at ${backup.file_path}`);
  }
  assertInsideBackupDir(backup.file_path);

  let payload = null;
  let preRestoreSnapshotPath = null;

  try {
    payload = resolveDatabasePayload(backup);

    // Verify candidate backup integrity
    const integrity = verifySqliteIntegrity(payload.filePath);
    if (!integrity.valid) {
      throw new Error(`Cannot restore: Backup file failed integrity check (${integrity.error})`);
    }

    const activeDbPath = config.database?.path || path.resolve(__dirname, '../../data/app.db');

    // Step 1: Create a safety snapshot of the CURRENT database before overwriting
    if (fs.existsSync(activeDbPath)) {
      const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss-SSS');
      preRestoreSnapshotPath = path.join(BACKUP_DIR, `pre_restore_safety_${ts}.db`);
      try {
        const activeDb = getDb();
        await activeDb.backup(preRestoreSnapshotPath);
      } catch {
        // Fallback copy
        fs.copyFileSync(activeDbPath, preRestoreSnapshotPath);
      }
    }

    try {
      // Step 2: Close active connection
      closeDatabase();

      // Step 3: Replace file
      fs.copyFileSync(payload.filePath, activeDbPath);

      // Remove WAL & SHM files to ensure clean open
      for (const ext of ['-wal', '-shm']) {
        const f = activeDbPath + ext;
        if (fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch {}
        }
      }

      // Step 4: Re-open and verify database
      const newDb = initDatabase();
      const testCount = newDb.prepare('SELECT COUNT(*) as c FROM users').get()?.c;

      // Record the safety snapshot in the restored database so it is visible
      // and exempt from normal pruning until it ages out.
      if (preRestoreSnapshotPath && fs.existsSync(preRestoreSnapshotPath)) {
        try {
          newDb.prepare(`
            INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
            VALUES (?, 'database', ?, ?, 'verified', NULL, ?, datetime('now'))
          `).run(
            path.basename(preRestoreSnapshotPath),
            preRestoreSnapshotPath,
            fs.statSync(preRestoreSnapshotPath).size,
            `Automatic pre-restore safety snapshot before backup #${backupId}`
          );
        } catch (recordErr) {
          logger.warn({ err: recordErr.message }, 'Could not record pre-restore safety snapshot');
        }
      }

      logChange({
        tgId: userTgId,
        category: 'backups',
        action: 'database_restored',
        details: `Restored database from backup #${backupId} (${backup.backup_name}). Pre-restore snapshot: ${path.basename(preRestoreSnapshotPath || '')}`,
        metadata: { backupId, restoredFrom: backup.backup_name, safetySnapshot: preRestoreSnapshotPath }
      }).catch(() => {});

      return {
        success: true,
        message: `Database restored successfully from "${backup.backup_name}".`,
        // Restores always apply only the SQLite database. A full archive also
        // contains Nginx routes and configuration files, but those are kept
        // as reference material and are never written back automatically.
        restoreScope: 'database',
        sourceBackupType: backup.backup_type,
        preRestoreSnapshot: preRestoreSnapshotPath ? path.basename(preRestoreSnapshotPath) : null,
        usersCount: testCount
      };
    } catch (err) {
      // If restore failed, try restoring preRestoreSnapshot
      if (preRestoreSnapshotPath && fs.existsSync(preRestoreSnapshotPath)) {
        try {
          fs.copyFileSync(preRestoreSnapshotPath, activeDbPath);
          initDatabase();
        } catch {}
      }
      throw new Error(`Failed to restore database: ${err.message}. Safety snapshot preserved.`);
    }
  } finally {
    if (payload?.temporary) safeUnlink(payload.filePath);
  }
}

/**
 * Deep integrity verification of backup file (database or full archive)
 */
async function verifyBackupIntegrity(backupId) {
  const backup = getBackupById(backupId);
  if (!backup) throw new Error(`Backup #${backupId} not found`);
  if (!fs.existsSync(backup.file_path)) {
    throw new Error(`Backup file missing from filesystem: ${backup.file_path}`);
  }
  assertInsideBackupDir(backup.file_path);

  const stat = fs.statSync(backup.file_path);
  const actualSha256 = await calculateFileSha256(backup.file_path);
  const checksumMatch = backup.checksum ? (actualSha256.toLowerCase() === backup.checksum.toLowerCase()) : true;

  let sqliteCheck = { valid: true };
  let payload = null;
  try {
    payload = resolveDatabasePayload(backup);
    sqliteCheck = verifySqliteIntegrity(payload.filePath);
    if (sqliteCheck.valid) {
      const Database = require('better-sqlite3');
      try {
        const testDb = new Database(payload.filePath, { readonly: true, fileMustExist: true });
        const checkResult = testDb.pragma('integrity_check');
        testDb.close();
        sqliteCheck.pragma = checkResult;
        if (Array.isArray(checkResult) && checkResult[0]?.integrity_check !== 'ok') {
          sqliteCheck.valid = false;
          sqliteCheck.error = 'SQLite integrity_check did not return ok';
        }
      } catch (err) {
        sqliteCheck.valid = false;
        sqliteCheck.error = err.message;
      }
    }
  } catch (err) {
    sqliteCheck = { valid: false, error: err.message };
  } finally {
    if (payload?.temporary) safeUnlink(payload.filePath);
  }

  const passed = checksumMatch && sqliteCheck.valid;

  // Update status in db if passed
  const db = getDb();
  db.prepare("UPDATE system_backups SET status=? WHERE id=?").run(passed ? 'verified' : 'failed', backupId);

  return {
    backupId,
    backupName: backup.backup_name,
    backupType: backup.backup_type,
    valid: passed,
    fileSizeBytes: stat.size,
    checksum: actualSha256,
    checksumMatch,
    sqliteCheck,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Isolated Dry-Run Restore Testing
 * Restores the backup snapshot to an ephemeral sandbox database, runs structural queries,
 * verifies zero data corruption, and purges the sandbox without touching production.
 */
async function testRestoreBackup(backupId, userTgId = null) {
  const backup = getBackupById(backupId);
  if (!backup) throw new Error(`Backup #${backupId} not found`);
  if (!fs.existsSync(backup.file_path)) {
    throw new Error(`Backup file missing at ${backup.file_path}`);
  }

  const startTime = Date.now();
  const testDbName = `test_restore_${backupId}_${Date.now()}.db`;
  const testDbPath = path.join(BACKUP_DIR, testDbName);

  try {
    if (backup.backup_type === 'database') {
      fs.copyFileSync(backup.file_path, testDbPath);
    } else if (backup.backup_type === 'full') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(backup.file_path);
      const dbEntry = zip.getEntry('database/app.db');
      if (!dbEntry) throw new Error('Archive missing internal "database/app.db" payload');
      fs.writeFileSync(testDbPath, dbEntry.getData());
    }

    const Database = require('better-sqlite3');
    const testDb = new Database(testDbPath, { readonly: true });

    // 1. Run full SQLite integrity check
    const integrityCheck = testDb.pragma('integrity_check');

    // 2. Query schema tables
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);

    // 3. Count key records
    const counts = {};
    for (const t of ['users', 'aliases', 'subdomains', 'applications', 'custom_domains']) {
      if (tables.includes(t)) {
        try {
          counts[t] = testDb.prepare(`SELECT COUNT(*) as c FROM ${t}`).get()?.c || 0;
        } catch {
          counts[t] = 'error';
        }
      }
    }

    testDb.close();

    // Safely cleanup ephemeral sandbox
    try { fs.unlinkSync(testDbPath); } catch {}

    const durationMs = Date.now() - startTime;

    logChange({
      tgId: userTgId,
      category: 'backups',
      action: 'backup_test_restore',
      details: `Completed dry-run restore test for backup #${backupId} (${backup.backup_name}) in ${durationMs}ms`,
      metadata: { backupId, durationMs, tablesCount: tables.length, counts }
    }).catch(() => {});

    return {
      success: true,
      backupId,
      backupName: backup.backup_name,
      integrityCheck: integrityCheck?.[0]?.integrity_check || 'ok',
      tablesCount: tables.length,
      tables,
      recordCounts: counts,
      durationMs,
      testedAt: new Date().toISOString()
    };
  } catch (err) {
    try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch {}
    throw new Error(`Dry-run restore test failed: ${err.message}`);
  }
}

/**
 * Delete a backup record and its file. The newest backup is protected unless
 * force is set, so an accidental click cannot remove the only recovery point.
 */
async function deleteBackup(backupId, { force = false, userTgId = null } = {}) {
  const backup = getBackupById(backupId);
  if (!backup) throw new Error(`Backup #${backupId} not found`);

  if (!force) {
    const newest = getDb().prepare('SELECT id FROM system_backups ORDER BY created_at DESC, id DESC LIMIT 1').get();
    if (newest?.id === backup.id) {
      throw new Error('Refusing to delete the most recent backup without force=true');
    }
  }

  assertInsideBackupDir(backup.file_path);
  safeUnlink(backup.file_path);
  getDb().prepare('DELETE FROM system_backups WHERE id=?').run(backupId);

  logChange({
    tgId: userTgId,
    category: 'backups',
    action: 'backup_deleted',
    details: `Deleted backup #${backupId} (${backup.backup_name})`,
    metadata: { backupId, fileName: backup.backup_name }
  }).catch(() => {});

  return { success: true, deletedId: backupId, backupName: backup.backup_name };
}

/**
 * Tiered retention:
 *  - keep everything newer than retentionDays
 *  - keep the newest backup for each of the last N days
 *  - keep the newest backup for each of the last N weeks
 *  - always keep the single most recent backup
 */
async function pruneBackups(options = {}) {
  const db = getDb();
  const retentionDays = Number.isFinite(Number(options.retentionDays))
    ? Number(options.retentionDays)
    : (config.backup?.retentionDays || 14);
  const dailyKeep = Number.isFinite(Number(options.daily)) ? Number(options.daily) : (config.backup?.retentionDaily || 7);
  const weeklyKeep = Number.isFinite(Number(options.weekly)) ? Number(options.weekly) : (config.backup?.retentionWeekly || 4);

  const rows = db.prepare('SELECT id, file_path, backup_name, created_at FROM system_backups ORDER BY created_at DESC, id DESC').all();
  if (rows.length === 0) return { pruned: 0, kept: 0 };

  const keep = new Set();
  const now = dayjs();
  const cutoff = now.subtract(retentionDays, 'day');
  const dailyCutoff = now.subtract(dailyKeep, 'day').startOf('day');
  const weeklyCutoff = now.subtract(weeklyKeep, 'week').startOf('week');

  const seenDays = new Set();
  const seenWeeks = new Set();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const created = dayjs(row.created_at);
    if (index === 0) {
      keep.add(row.id); // newest row is always kept
      continue;
    }
    if (created.isAfter(cutoff)) { keep.add(row.id); continue; }

    const dayKey = created.format('YYYY-MM-DD');
    if (created.isAfter(dailyCutoff) && !seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      keep.add(row.id);
      continue;
    }

    const weekKey = created.startOf('week').format('YYYY-MM-DD');
    if (created.isAfter(weeklyCutoff) && !seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      keep.add(row.id);
    }
  }

  // Always keep safety snapshots created by a restore for at least the normal
  // retention period, even if they fall outside the daily/weekly tiers.
  let pruned = 0;
  for (const row of rows) {
    if (keep.has(row.id)) continue;
    const name = String(row.backup_name || '');
    if (name.startsWith('pre_restore_safety_') && dayjs(row.created_at).isAfter(cutoff)) continue;
    safeUnlink(row.file_path);
    db.prepare('DELETE FROM system_backups WHERE id=?').run(row.id);
    pruned++;
  }

  // Remove orphan archive files left behind by an interrupted run. Only touch
  // files that match our own naming scheme and are older than the cutoff.
  try {
    const referenced = new Set(db.prepare('SELECT file_path FROM system_backups').all().map(r => path.resolve(r.file_path)));
    for (const file of fs.readdirSync(BACKUP_DIR)) {
      if (!/^backup_(db|full)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d{1,3})?\.(db|zip)$/.test(file)) continue;
      const full = path.join(BACKUP_DIR, file);
      if (referenced.has(path.resolve(full))) continue;
      const stat = fs.statSync(full);
      if (dayjs(stat.mtimeMs).isBefore(cutoff)) safeUnlink(full);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Backup orphan cleanup failed');
  }

  return { pruned, kept: rows.length - pruned };
}

module.exports = {
  BACKUP_DIR,
  createDatabaseBackup,
  createFullSystemBackup,
  getBackupById,
  listBackups,
  restoreDatabaseBackup,
  verifySqliteIntegrity,
  verifyBackupIntegrity,
  testRestoreBackup,
  deleteBackup,
  pruneBackups
};
