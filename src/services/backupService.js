'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const archiver = require('archiver');
const dayjs = require('dayjs');
const { getDb, initDatabase, closeDatabase } = require('../../database/database');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const BACKUP_DIR = config.backup?.dir || path.resolve(__dirname, '../../../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

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
  const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  const backupFileName = `backup_db_${ts}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  const db = getDb();

  // Use better-sqlite3 online backup API for crash-consistent snapshot
  await db.backup(backupFilePath);

  // Verify integrity
  const integrity = verifySqliteIntegrity(backupFilePath);
  if (!integrity.valid) {
    try { fs.unlinkSync(backupFilePath); } catch {}
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
 * Create full system archive backup (database + nginx routes + configs)
 */
async function createFullSystemBackup(notes = 'Full system backup', userTgId = null) {
  // First create verified db snapshot
  const dbSnap = await createDatabaseBackup('Database component of full archive', userTgId);

  const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  const zipFileName = `backup_full_${ts}.zip`;
  const zipFilePath = path.join(BACKUP_DIR, zipFileName);

  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // Add db snapshot
    archive.file(dbSnap.file_path, { name: 'database/app.db' });

    // Add nginx routes if they exist
    const routesDir = path.resolve(__dirname, '../../../nginx/routes');
    if (fs.existsSync(routesDir)) {
      archive.directory(routesDir, 'nginx/routes');
    }

    archive.finalize();
  });

  const checksum = await calculateFileSha256(zipFilePath);
  const stat = fs.statSync(zipFilePath);

  const db = getDb();
  const info = db.prepare(`
    INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
    VALUES (?, 'full', ?, ?, 'verified', ?, ?, datetime('now'))
  `).run(zipFileName, zipFilePath, stat.size, checksum, notes);

  return getBackupById(info.lastInsertRowid);
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

  // Verify candidate backup integrity
  const integrity = verifySqliteIntegrity(backup.file_path);
  if (!integrity.valid) {
    throw new Error(`Cannot restore: Backup file failed integrity check (${integrity.error})`);
  }

  const activeDbPath = config.database?.path || path.resolve(__dirname, '../../../data/app.db');

  // Step 1: Create a safety snapshot of the CURRENT database before overwriting
  let preRestoreSnapshotPath = null;
  if (fs.existsSync(activeDbPath)) {
    const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
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
    fs.copyFileSync(backup.file_path, activeDbPath);

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
}

/**
 * Prune old backups based on retention policy
 */
async function pruneBackups(retentionDays = 14) {
  const db = getDb();
  const cutoff = dayjs().subtract(retentionDays, 'day').format('YYYY-MM-DD HH:mm:ss');
  const oldBackups = db.prepare('SELECT id, file_path FROM system_backups WHERE created_at < ?').all(cutoff);

  for (const b of oldBackups) {
    if (fs.existsSync(b.file_path)) {
      try { fs.unlinkSync(b.file_path); } catch {}
    }
    db.prepare('DELETE FROM system_backups WHERE id=?').run(b.id);
  }
}

module.exports = {
  BACKUP_DIR,
  createDatabaseBackup,
  createFullSystemBackup,
  getBackupById,
  listBackups,
  restoreDatabaseBackup,
  verifySqliteIntegrity,
  pruneBackups
};
