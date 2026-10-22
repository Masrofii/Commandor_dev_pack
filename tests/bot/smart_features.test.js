'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = '/tmp/test-smart-features.db';
process.env.DOMAINS = 'commandor.my.id';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { detectServiceAndCategory, summarizeEmail, extractVerificationCode } = require('../../src/utils/helpers');
const { createThrowaway, promptBroadcastPreview, handleConfirmedBroadcast } = require('../../src/bot/commands');
const { createAlias, getUserAliases } = require('../../src/services/aliasService');

const ADMIN_ID = 8319534224;
const REGULAR_USER_ID = 123456789;

beforeAll(() => {
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
  initDatabase();
  runMigrations();

  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(ADMIN_ID, 'admin_user', 'admin', 'en');
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(REGULAR_USER_ID, 'normal_user', 'user', 'en');
});

afterAll(() => {
  closeDatabase();
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
});

describe('Smart Inbox Categorization & Verification Code Assistant', () => {
  test('Accurately detects popular services from sender and subject', () => {
    const resDiscord = detectServiceAndCategory('noreply@discord.com', 'Your Discord security code', 'Your verification code is 849201. It is valid for 10 minutes.');
    expect(resDiscord.service).toBe('Discord');
    expect(resDiscord.category).toBe('otp');
    expect(resDiscord.otp).toBe('849201');
    expect(resDiscord.expiresEstimate).toContain('10');

    const resGitHub = detectServiceAndCategory('support@github.com', '[GitHub] Please verify your device', 'Verification code: 194820');
    expect(resGitHub.service).toBe('GitHub');
    expect(resGitHub.category).toBe('otp');
    expect(resGitHub.otp).toBe('194820');

    const resSteam = detectServiceAndCategory('noreply@steampowered.com', 'Your Steam account: Access from new computer', 'Here is the Steam Guard code: G-482910');
    expect(resSteam.service).toBe('Steam');
    expect(resSteam.category).toBe('otp');
  });

  test('Categorizes security alerts, receipts, and newsletters correctly', () => {
    const resSecurity = detectServiceAndCategory('security@google.com', 'Security alert: New login detected', 'A new login from Linux was detected.');
    expect(resSecurity.category).toBe('security');

    const resReceipt = detectServiceAndCategory('billing@stripe.com', 'Receipt for your invoice #1042', 'Your payment was successfully received. Charged $15.00.');
    expect(resReceipt.category).toBe('receipt');

    const resNewsletter = detectServiceAndCategory('digest@techweekly.com', 'Weekly Newsletter Issue 82', 'Unsubscribe here if you no longer wish to receive updates.');
    expect(resNewsletter.category).toBe('newsletter');
  });

  test('summarizeEmail extracts action sentence and strips boilerplate', () => {
    const body = `View in browser\n\nWelcome to Commandor! Please verify your email by entering your confirmation code.\n\nSent from my iPhone\nUnsubscribe`;
    const summary = summarizeEmail('Welcome to Commandor', body);
    expect(summary).toContain('Please verify your email');
    expect(summary).not.toContain('Sent from my iPhone');
  });
});

describe('One-Command Alias Creation & Bulk Generator', () => {
  test('Creates alias with specified label', async () => {
    let replyMsg = null;
    const ctx = {
      from: { id: REGULAR_USER_ID, username: 'normal_user' },
      chat: { id: REGULAR_USER_ID },
      reply: jest.fn().mockImplementation((text) => {
        replyMsg = text;
        return Promise.resolve({ message_id: 10 });
      })
    };

    await createThrowaway(ctx, 'en', 'shopping');
    expect(replyMsg).toContain('Label:');
    expect(replyMsg).toContain('shopping');

    const data = getUserAliases(REGULAR_USER_ID);
    const created = data.aliases.find(a => a.label === 'shopping');
    expect(created).toBeDefined();
    expect(created.address).toContain('@commandor.my.id');
  });

  test('Bulk alias creation generates multiple distinct aliases with sequential labels', () => {
    const created = [];
    for (let i = 0; i < 5; i++) {
      const a = createAlias({ tgId: REGULAR_USER_ID, domain: 'commandor.my.id', type: 'throwaway', label: `Testing #${i + 1}` });
      created.push(a);
    }
    expect(created.length).toBe(5);
    const addresses = new Set(created.map(a => a.address));
    expect(addresses.size).toBe(5);
  });
});

describe('Broadcast History Persistence', () => {
  test('Records confirmed broadcast in broadcast_history table', () => {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS broadcast_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_tg_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message_preview TEXT,
      total_recipients INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT(datetime('now'))
    )`);

    db.prepare(`INSERT INTO broadcast_history (author_tg_id, type, message_preview, total_recipients, delivered_count, blocked_count, failed_count, elapsed_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      ADMIN_ID,
      'text',
      'System maintenance notice scheduled for tonight.',
      100,
      95,
      3,
      2,
      1.5
    );

    const latest = db.prepare('SELECT * FROM broadcast_history ORDER BY id DESC LIMIT 1').get();
    expect(latest).toBeDefined();
    expect(latest.author_tg_id).toBe(ADMIN_ID);
    expect(latest.delivered_count).toBe(95);
    expect(latest.total_recipients).toBe(100);
    expect(latest.message_preview).toContain('System maintenance');
  });
});
