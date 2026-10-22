'use strict';
const path = require('path');
const fs = require('fs');
const { initDatabase, getDb, runMigrations, closeDatabase } = require('../../database/database');
const {
  formatBytes,
  checkStorageBackendCapacity,
  checkEmailStorageQuota,
  checkHostingStorageQuota,
  checkAliasQuota,
  getUserComprehensiveStorageStats,
  getGlobalStorageMetrics
} = require('../../src/services/quotaService');
const { storeEmail, softDeleteEmail } = require('../../src/services/emailService');

describe('Accurate Separate Storage Quotas & Enforcement', () => {
  let db;

  beforeAll(() => {
    // Run all migrations including 017
    runMigrations();
    db = getDb();
  });

  afterAll(() => {
    closeDatabase();
  });

  beforeEach(() => {
    // Clean test records
    db.prepare('DELETE FROM attachments').run();
    db.prepare('DELETE FROM emails').run();
    db.prepare('DELETE FROM aliases').run();
    db.prepare('DELETE FROM hosting_sites').run();
    db.prepare('DELETE FROM users WHERE tg_id >= 900000').run();
  });

  describe('1. Backend Storage Capacity Check', () => {
    test('checkStorageBackendCapacity validates available disk space', () => {
      const res = checkStorageBackendCapacity(1024);
      expect(res.available).toBe(true);
      if (res.totalBytes) {
        expect(res.totalBytes).toBeGreaterThan(0);
        expect(res.freeBytes).toBeGreaterThan(0);
      }
    });

    test('formatBytes helper formats byte sizes accurately', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(5368709120)).toBe('5 GB');
    });
  });

  describe('2. Email Storage Quota Enforcement', () => {
    test('allows email ingestion when under 1 GB email quota', async () => {
      // Create user with 1 GB email quota
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_limit, alias_limit)
        VALUES (900001, 'tester1', 'user', 0, 1073741824, 5368709120, 10)
      `).run();

      db.prepare(`
        INSERT INTO aliases (address, tg_id, domain, active)
        VALUES ('test1@example.com', 900001, 'example.com', 1)
      `).run();

      const alias = db.prepare('SELECT * FROM aliases WHERE address = ?').get('test1@example.com');
      const rawEml = Buffer.from('Subject: Hello\r\n\r\nHello World Message');

      const parsed = {
        messageId: '<msg-1@example.com>',
        subject: 'Hello',
        sender: 'sender@example.com',
        senderName: 'Sender',
        recipient: 'test1@example.com',
        replyTo: null,
        textBody: 'Hello World Message',
        htmlBody: '<p>Hello World Message</p>',
        headers: {},
        attachments: []
      };

      const result = await storeEmail({
        parsedEmail: parsed,
        rawEml,
        aliasRecord: alias
      });

      expect(result.emailRecord).toBeDefined();
      expect(result.emailRecord.id).toBeGreaterThan(0);

      // Verify email_storage_used and storage_used were updated
      const updatedUser = db.prepare('SELECT email_storage_used, storage_used FROM users WHERE tg_id = 900001').get();
      expect(updatedUser.email_storage_used).toBe(rawEml.length);
      expect(updatedUser.storage_used).toBe(rawEml.length);
    });

    test('rejects email ingestion server-side when email quota would be exceeded', async () => {
      // User with 10 KB quota, currently using 9 KB
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_limit, alias_limit)
        VALUES (900002, 'tester2', 'user', 9000, 10000, 5368709120, 10)
      `).run();

      db.prepare(`
        INSERT INTO aliases (address, tg_id, domain, active)
        VALUES ('test2@example.com', 900002, 'example.com', 1)
      `).run();

      const alias = db.prepare('SELECT * FROM aliases WHERE address = ?').get('test2@example.com');
      // 2 KB message (9 KB + 2 KB = 11 KB > 10 KB limit)
      const rawEml = Buffer.alloc(2000, 'X');

      const parsed = {
        messageId: '<msg-2@example.com>',
        subject: 'Too Big',
        sender: 'sender@example.com',
        senderName: 'Sender',
        recipient: 'test2@example.com',
        replyTo: null,
        textBody: 'Big email',
        htmlBody: '<p>Big email</p>',
        headers: {},
        attachments: []
      };

      await expect(storeEmail({
        parsedEmail: parsed,
        rawEml,
        aliasRecord: alias
      })).rejects.toThrow(/Email storage quota exceeded/i);

      // Verify email was NOT inserted into emails table
      const count = db.prepare('SELECT COUNT(*) as c FROM emails WHERE alias_address = ?').get('test2@example.com').c;
      expect(count).toBe(0);

      // Verify storage was not incremented
      const user = db.prepare('SELECT email_storage_used FROM users WHERE tg_id = 900002').get();
      expect(user.email_storage_used).toBe(9000);
    });

    test('accounts for attachment sizes during quota enforcement', async () => {
      // User with 5 KB quota, currently using 0 KB
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_limit, alias_limit)
        VALUES (900003, 'tester3', 'user', 0, 5000, 5368709120, 10)
      `).run();

      db.prepare(`
        INSERT INTO aliases (address, tg_id, domain, active)
        VALUES ('test3@example.com', 900003, 'example.com', 1)
      `).run();

      const alias = db.prepare('SELECT * FROM aliases WHERE address = ?').get('test3@example.com');
      const rawEml = Buffer.from('Subject: With Attachment\r\n\r\nSee file');
      // 10 KB attachment exceeds 5 KB quota
      const attachmentContent = Buffer.alloc(10000, 'A');

      const parsed = {
        messageId: '<msg-3@example.com>',
        subject: 'With Attachment',
        sender: 'sender@example.com',
        senderName: 'Sender',
        recipient: 'test3@example.com',
        replyTo: null,
        textBody: 'See file',
        htmlBody: '<p>See file</p>',
        headers: {},
        attachments: [{
          filename: 'payload.bin',
          contentType: 'application/octet-stream',
          size: 10000,
          content: attachmentContent,
          sha256: 'deadbeef1234'
        }]
      };

      await expect(storeEmail({
        parsedEmail: parsed,
        rawEml,
        aliasRecord: alias
      })).rejects.toThrow(/Email storage quota exceeded/i);
    });

    test('deleting an email frees up email storage quota', async () => {
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_limit, alias_limit)
        VALUES (900004, 'tester4', 'user', 0, 1073741824, 5368709120, 10)
      `).run();

      db.prepare(`
        INSERT INTO aliases (address, tg_id, domain, active)
        VALUES ('test4@example.com', 900004, 'example.com', 1)
      `).run();

      const alias = db.prepare('SELECT * FROM aliases WHERE address = ?').get('test4@example.com');
      const rawEml = Buffer.alloc(1500, 'Z');

      const stored = await storeEmail({
        parsedEmail: {
          messageId: '<msg-4@example.com>',
          subject: 'To Delete',
          sender: 's@ex.com',
          senderName: 'S',
          recipient: 'test4@example.com',
          replyTo: null,
          textBody: 'Text',
          htmlBody: '<p>Text</p>',
          headers: {},
          attachments: []
        },
        rawEml,
        aliasRecord: alias
      });

      const beforeDelete = db.prepare('SELECT email_storage_used FROM users WHERE tg_id = 900004').get();
      expect(beforeDelete.email_storage_used).toBe(1500);

      // Soft delete email
      const deleted = softDeleteEmail(stored.emailRecord.id, 900004);
      expect(deleted).toBe(true);

      const afterDelete = db.prepare('SELECT email_storage_used FROM users WHERE tg_id = 900004').get();
      expect(afterDelete.email_storage_used).toBe(0);
    });
  });

  describe('3. Hosting Storage Quota Enforcement', () => {
    test('checkHostingStorageQuota allows deployment within 5 GB hosting limit', () => {
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_used, hosting_storage_limit, alias_limit)
        VALUES (900005, 'tester5', 'user', 0, 1073741824, 0, 5368709120, 10)
      `).run();

      // 50 MB site
      const allowed = checkHostingStorageQuota(900005, 52428800);
      expect(allowed).toBe(true);
    });

    test('checkHostingStorageQuota rejects deployment exceeding user hosting quota', () => {
      // 100 MB quota, using 80 MB
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_used, hosting_storage_limit, alias_limit)
        VALUES (900006, 'tester6', 'user', 0, 1073741824, 83886080, 104857600, 10)
      `).run();

      // Attempting to upload 30 MB (80 MB + 30 MB = 110 MB > 100 MB)
      expect(() => {
        checkHostingStorageQuota(900006, 31457280);
      }).toThrow(/Hosting storage quota exceeded/i);
    });
  });

  describe('4. Safe Quota Reduction Without Data Deletion (Requirement 10)', () => {
    test('reducing a quota does NOT delete user data but flags over-quota and blocks new writes', async () => {
      // User with 50 MB used out of 100 MB limit
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_used, hosting_storage_limit, alias_limit)
        VALUES (900007, 'tester7', 'user', 52428800, 104857600, 0, 5368709120, 10)
      `).run();

      db.prepare(`
        INSERT INTO aliases (address, tg_id, domain, active)
        VALUES ('test7@example.com', 900007, 'example.com', 1)
      `).run();

      // Admin reduces quota to 10 MB (lower than current 50 MB usage)
      db.prepare('UPDATE users SET email_storage_limit = 10485760 WHERE tg_id = 900007').run();

      // Verify existing data is preserved (usage remains 50 MB)
      const user = db.prepare('SELECT email_storage_used, email_storage_limit FROM users WHERE tg_id = 900007').get();
      expect(user.email_storage_used).toBe(52428800);
      expect(user.email_storage_limit).toBe(10485760);

      // Stats reflect over-quota condition
      const stats = getUserComprehensiveStorageStats(900007);
      expect(stats.email.isOverQuota).toBe(true);
      expect(stats.email.usagePercent).toBe(500); // 50MB / 10MB = 500%
      expect(stats.email.remainingBytes).toBe(0);

      // Attempting to store new email is blocked
      const alias = db.prepare('SELECT * FROM aliases WHERE address = ?').get('test7@example.com');
      const rawEml = Buffer.from('Subject: Test\r\n\r\nBody');

      await expect(storeEmail({
        parsedEmail: {
          messageId: '<msg-7@example.com>',
          subject: 'Test',
          sender: 's@ex.com',
          senderName: 'S',
          recipient: 'test7@example.com',
          replyTo: null,
          textBody: 'Body',
          htmlBody: '<p>Body</p>',
          headers: {},
          attachments: []
        },
        rawEml,
        aliasRecord: alias
      })).rejects.toThrow(/Email storage quota exceeded/i);
    });
  });

  describe('5. Separate Count-Based Alias Quota', () => {
    test('checkAliasQuota treats aliases as a count-based quota', () => {
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_limit, alias_limit)
        VALUES (900008, 'tester8', 'user', 0, 1073741824, 5368709120, 2)
      `).run();

      db.prepare(`INSERT INTO aliases (address, tg_id, domain, active) VALUES ('a1@ex.com', 900008, 'ex.com', 1)`).run();

      const stats1 = checkAliasQuota(900008);
      expect(stats1.active).toBe(1);
      expect(stats1.limit).toBe(2);
      expect(stats1.canCreate).toBe(true);
      expect(stats1.remaining).toBe(1);

      db.prepare(`INSERT INTO aliases (address, tg_id, domain, active) VALUES ('a2@ex.com', 900008, 'ex.com', 1)`).run();

      const stats2 = checkAliasQuota(900008);
      expect(stats2.active).toBe(2);
      expect(stats2.limit).toBe(2);
      expect(stats2.canCreate).toBe(false);
      expect(stats2.remaining).toBe(0);
    });
  });

  describe('6. Global Storage Monitoring & Configurable Warning Thresholds', () => {
    test('getGlobalStorageMetrics returns host disk, email, hosting pools and warning thresholds', () => {
      // Create test user exceeding quota to verify over-quota count
      db.prepare(`
        INSERT INTO users (tg_id, username, role, email_storage_used, email_storage_limit, hosting_storage_used, hosting_storage_limit, alias_limit)
        VALUES (900009, 'tester9', 'user', 2000, 1000, 0, 5368709120, 5)
      `).run();

      const metrics = getGlobalStorageMetrics({ warning: 80, high: 90, critical: 95 });

      expect(metrics.disk).toBeDefined();
      expect(metrics.thresholds).toEqual({ warning: 80, high: 90, critical: 95 });
      expect(metrics.platform.email).toBeDefined();
      expect(metrics.platform.hosting).toBeDefined();
      expect(metrics.platform.aliases).toBeDefined();
      expect(metrics.platform.overQuotaUsers).toBeGreaterThanOrEqual(1);

      // Warning should be generated for over-quota accounts
      expect(metrics.warnings.some(w => w.type === 'users_over_quota')).toBe(true);
    });
  });
});
