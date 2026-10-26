'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';

const fs = require('fs');
const os = require('os');
const path = require('path');

const backupDir = path.join(os.tmpdir(), `commandor-backup-test-${process.pid}-${Date.now()}`);
process.env.BACKUP_DIR = backupDir;

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  BACKUP_DIR,
  createDatabaseBackup,
  createFullSystemBackup,
  getBackupById,
  listBackups,
  verifyBackupIntegrity,
  testRestoreBackup,
  deleteBackup,
  pruneBackups
} = require('../../src/services/backupService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'backupuser', 'user')").run();
});

afterAll(() => {
  closeDatabase();
  try {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  } catch {}
});

beforeEach(() => {
  getDb().prepare('DELETE FROM system_backups').run();
});

describe('Backup lifecycle management', () => {
  test('creates unique, verified database backups and validates their checksums', async () => {
    const first = await createDatabaseBackup('First backup', 1001);
    const second = await createDatabaseBackup('Second backup', 1001);

    expect(first.status).toBe('verified');
    expect(second.status).toBe('verified');
    expect(first.file_path).not.toBe(second.file_path);
    expect(fs.existsSync(first.file_path)).toBe(true);
    expect(fs.existsSync(second.file_path)).toBe(true);
    expect(path.dirname(first.file_path)).toBe(BACKUP_DIR);

    const verification = await verifyBackupIntegrity(first.id);
    expect(verification.valid).toBe(true);
    expect(verification.checksumMatch).toBe(true);
    expect(verification.sqliteCheck.valid).toBe(true);
  });

  test('creates a full archive backup containing a restorable database payload', async () => {
    const backup = await createFullSystemBackup('Full backup', 1001);
    expect(backup.backup_type).toBe('full');
    expect(backup.file_path.endsWith('.zip')).toBe(true);

    const verification = await verifyBackupIntegrity(backup.id);
    expect(verification.valid).toBe(true);

    const dryRun = await testRestoreBackup(backup.id, 1001);
    expect(dryRun.success).toBe(true);
    expect(dryRun.integrityCheck).toBe('ok');
    expect(dryRun.tables).toContain('users');
    expect(dryRun.recordCounts.users).toBeGreaterThanOrEqual(1);
  });

  test('refuses to delete the newest backup unless forced', async () => {
    const first = await createDatabaseBackup('First backup', 1001);
    const second = await createDatabaseBackup('Second backup', 1001);

    await expect(deleteBackup(second.id)).rejects.toThrow(/most recent backup/i);
    expect(getBackupById(second.id)).toBeDefined();

    const deleted = await deleteBackup(first.id);
    expect(deleted.success).toBe(true);
    expect(getBackupById(first.id)).toBeNull();
    expect(fs.existsSync(first.file_path)).toBe(false);

    await expect(deleteBackup(second.id, { force: true })).resolves.toMatchObject({ success: true, deletedId: second.id });
    expect(getBackupById(second.id)).toBeNull();
    expect(fs.existsSync(second.file_path)).toBe(false);
  });

  test('prunes old backups using tiered retention while keeping the newest', async () => {
    const db = getDb();
    const rows = [];
    const dates = ['2019-01-01 00:00:00', '2019-01-02 00:00:00', '2019-01-03 00:00:00', '2019-01-04 00:00:00'];
    for (let i = 0; i < dates.length; i++) {
      const filePath = path.join(BACKUP_DIR, `backup_db_2019-01-0${i + 1}_00-00-00-000.db`);
      fs.writeFileSync(filePath, 'SQLite format 3\0test');
      const info = db.prepare(`
        INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
        VALUES (?, 'database', ?, ?, 'verified', NULL, 'retention test', ?)
      `).run(path.basename(filePath), filePath, 20, dates[i]);
      rows.push({ id: info.lastInsertRowid, filePath });
    }

    const orphanPath = path.join(BACKUP_DIR, 'backup_db_2018-01-01_00-00-00-000.db');
    fs.writeFileSync(orphanPath, 'SQLite format 3\0orphan');
    const old = new Date('2018-01-01T00:00:00Z');
    fs.utimesSync(orphanPath, old, old);

    const unrelatedPath = path.join(BACKUP_DIR, 'notes.txt');
    fs.writeFileSync(unrelatedPath, 'keep me');
    fs.utimesSync(unrelatedPath, old, old);

    const result = await pruneBackups({ retentionDays: 0, daily: 0, weekly: 0 });
    expect(result.pruned).toBe(3);
    expect(result.kept).toBe(1);

    const remaining = listBackups();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(rows[rows.length - 1].id);
    expect(fs.existsSync(rows[rows.length - 1].filePath)).toBe(true);

    for (const row of rows.slice(0, -1)) {
      expect(getBackupById(row.id)).toBeNull();
      expect(fs.existsSync(row.filePath)).toBe(false);
    }

    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(unrelatedPath)).toBe(true);
  });

  test('never deletes files outside the configured backup directory', async () => {
    const outsidePath = path.join(os.tmpdir(), `commandor-outside-${Date.now()}.db`);
    fs.writeFileSync(outsidePath, 'SQLite format 3\0outside');
    const info = getDb().prepare(`
      INSERT INTO system_backups (backup_name, backup_type, file_path, file_size_bytes, status, checksum, notes, created_at)
      VALUES ('outside.db', 'database', ?, 21, 'verified', NULL, 'outside', datetime('now'))
    `).run(outsidePath);

    await expect(deleteBackup(info.lastInsertRowid, { force: true })).rejects.toThrow(/outside the configured backup directory/i);
    expect(getBackupById(info.lastInsertRowid)).toBeDefined();

    fs.rmSync(outsidePath, { force: true });
  });
});
