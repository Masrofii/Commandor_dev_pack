'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = '/tmp/test-tos-audit.db';
process.env.DOMAINS = 'commandor.my.id';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { logChange, getAuditLogs, getAuditStats } = require('../../src/services/auditLogger');
const {
  tosPromptKeyboard,
  tosFullKeyboard,
  tosDeclinedKeyboard,
  emailSuiteKeyboard,
  subdomainHubKeyboard,
  apiHubKeyboard,
  changeLogKeyboard,
  adminAuditLogsKeyboard,
  startInlineKeyboard,
  mainMenuKeyboard
} = require('../../src/bot/keyboards');
const { isTosAccepted } = require('../../src/bot/commands');

beforeAll(() => {
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
  initDatabase();
  runMigrations();
});

afterAll(() => {
  closeDatabase();
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
});

describe('Terms of Service and Audit Logging Engine', () => {
  test('New user starts with tos_accepted = 0 and updates to 1', () => {
    const db = getDb();
    const testTgId = 987654321;
    db.prepare('INSERT INTO users (tg_id, username, role) VALUES (?, ?, ?)').run(testTgId, 'tester', 'user');

    expect(isTosAccepted(testTgId)).toBe(false);

    db.prepare("UPDATE users SET tos_accepted = 1, tos_accepted_at = datetime('now') WHERE tg_id = ?").run(testTgId);

    expect(isTosAccepted(testTgId)).toBe(true);
  });

  test('AuditLogger records change and queries by category', async () => {
    const testTgId = 987654321;

    await logChange({
      tgId: testTgId,
      category: 'hosting',
      action: 'site_deployed',
      details: 'Deployed test site',
      notifyAdmin: false
    });

    await logChange({
      tgId: testTgId,
      category: 'email',
      action: 'alias_created',
      details: 'Created disposable alias',
      notifyAdmin: false
    });

    const allLogs = getAuditLogs({ limit: 10, category: 'all' });
    expect(allLogs.total).toBeGreaterThanOrEqual(2);
    expect(allLogs.logs.length).toBeGreaterThanOrEqual(2);

    const hostingLogs = getAuditLogs({ limit: 10, category: 'hosting' });
    expect(hostingLogs.logs.some(l => l.action === 'site_deployed')).toBe(true);

    const emailLogs = getAuditLogs({ limit: 10, category: 'email' });
    expect(emailLogs.logs.some(l => l.action === 'alias_created')).toBe(true);

    const stats = getAuditStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.today).toBeGreaterThanOrEqual(2);
  });

  test('ToS keyboards render expected buttons', () => {
    const promptKb = tosPromptKeyboard();
    expect(promptKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('tos:accept');
    expect(promptKb.reply_markup.inline_keyboard[1][0].callback_data).toBe('tos:full');
    expect(promptKb.reply_markup.inline_keyboard[1][1].callback_data).toBe('tos:decline');

    const fullKb = tosFullKeyboard();
    expect(fullKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('tos:accept');
    expect(fullKb.reply_markup.inline_keyboard[1][0].callback_data).toBe('tos:prompt');

    const declineKb = tosDeclinedKeyboard();
    expect(declineKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('tos:accept');
  });

  test('Organized modular keyboards render clean hierarchies', () => {
    const emailKb = emailSuiteKeyboard(5, 2);
    expect(emailKb.reply_markup.inline_keyboard.length).toBe(4);
    expect(emailKb.reply_markup.inline_keyboard[3][0].callback_data).toBe('menu:home');

    const subKb = subdomainHubKeyboard(2);
    expect(subKb.reply_markup.inline_keyboard.length).toBe(2);

    const apiKb = apiHubKeyboard(3);
    expect(apiKb.reply_markup.inline_keyboard.length).toBe(2);

    const changeKb = changeLogKeyboard(true);
    expect(changeKb.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data && btn.callback_data.startsWith('admin:logs:1')))).toBe(true);

    const mainKb = mainMenuKeyboard(true);
    expect(mainKb.reply_markup.keyboard.length).toBe(5);
    expect(mainKb.reply_markup.keyboard[0]).toContain('📬 Email Suite');
    expect(mainKb.reply_markup.keyboard[2]).toContain('📝 Change Log');

    const inlineKb = startInlineKeyboard('https://commandor.my.id', true, 1);
    expect(inlineKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('menu:email_suite');
    expect(inlineKb.reply_markup.inline_keyboard[3][0].callback_data).toBe('menu:changelog');
  });

  test('Admin audit logs keyboard pagination and category filter', () => {
    const kb = adminAuditLogsKeyboard(2, 5, 'hosting');
    const flat = kb.reply_markup.inline_keyboard.flat();
    expect(flat.some(b => b.text.includes('Prev'))).toBe(true);
    expect(flat.some(b => b.text.includes('Next'))).toBe(true);
    expect(flat.some(b => b.text.includes('• Hosting •'))).toBe(true);
  });
});
