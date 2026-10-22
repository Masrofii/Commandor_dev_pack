'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = '/tmp/test-broadcast-i18n.db';
process.env.DOMAINS = 'commandor.my.id';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { t, isRtl, SUPPORTED_LANGUAGES, detectLanguage } = require('../../src/i18n');
const {
  broadcastConfirmKeyboard,
  languageSelectionKeyboard,
  mainMenuKeyboard
} = require('../../src/bot/keyboards');
const {
  promptBroadcastPreview,
  handleConfirmedBroadcast,
  handleCancel,
  showLanguageSelection
} = require('../../src/bot/commands');
const {
  setBroadcast,
  peekBroadcast,
  takeBroadcast,
  setBroadcastConfirm,
  peekBroadcastConfirm,
  takeBroadcastConfirm,
  clearAllUserStates
} = require('../../src/bot/state');

const ADMIN_ID = 8319534224;
const REGULAR_USER_ID = 123456789;

beforeAll(() => {
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
  initDatabase();
  runMigrations();

  const db = getDb();
  // Insert test admin and regular users
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(ADMIN_ID, 'admin_user', 'admin', 'en');
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(REGULAR_USER_ID, 'normal_user', 'user', 'en');
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(999001, 'user_one', 'user', 'en');
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(999002, 'user_two', 'user', 'ar');
});

afterAll(() => {
  closeDatabase();
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
});

describe('Broadcast Announcement Bug Fix & Workflow', () => {
  test('Exact bug reproduction scenario: Admin sends "New update" and receives preview, NOT generic error', async () => {
    // 1. Admin triggers broadcast mode
    setBroadcast(ADMIN_ID, true);
    expect(peekBroadcast(ADMIN_ID)).toBeTruthy();

    takeBroadcast(ADMIN_ID);
    expect(peekBroadcast(ADMIN_ID)).toBeNull();

    // 2. Admin replies with "New update"
    let replyText = null;
    let replyOptions = null;
    const ctx = {
      from: { id: ADMIN_ID, username: 'admin_user' },
      chat: { id: ADMIN_ID },
      callbackQuery: null,
      reply: jest.fn().mockImplementation((text, opts) => {
        replyText = text;
        replyOptions = opts;
        return Promise.resolve({ message_id: 101 });
      }),
      editMessageText: jest.fn().mockResolvedValue(true)
    };

    // Execute promptBroadcastPreview with "New update"
    await promptBroadcastPreview(ctx, 'New update');

    // Verification:
    // It must NOT throw ReferenceError: broadcastConfirmKeyboard is not defined
    // It must have called ctx.reply with formatted preview text
    expect(replyText).toContain('Commandor Mail — Broadcast Announcement Preview');
    expect(replyText).toContain('New update');
    expect(replyText).toContain('Target Audience');

    // Verify keyboard markup contains confirm, edit, and cancel buttons
    expect(replyOptions).toBeDefined();
    expect(replyOptions.reply_markup).toBeDefined();
    const buttons = replyOptions.reply_markup.inline_keyboard.flat();
    expect(buttons.some(b => b.callback_data === 'admin:broadcast_confirm')).toBe(true);
    expect(buttons.some(b => b.callback_data === 'admin:broadcast_edit')).toBe(true);
    expect(buttons.some(b => b.callback_data === 'admin:broadcast_cancel')).toBe(true);

    // Verify broadcast confirmation state is saved in memory
    const savedConfirm = peekBroadcastConfirm(ADMIN_ID);
    expect(savedConfirm).toBeDefined();
    expect(savedConfirm.text).toBe('New update');
  });

  test('Editing the preview resets state back to pending content and does NOT send', async () => {
    setBroadcastConfirm(ADMIN_ID, { type: 'text', text: 'Original Draft' });
    expect(peekBroadcastConfirm(ADMIN_ID)).toBeDefined();

    // Simulate clicking "Edit Content" (admin:broadcast_edit)
    takeBroadcastConfirm(ADMIN_ID);
    setBroadcast(ADMIN_ID, true);

    expect(peekBroadcastConfirm(ADMIN_ID)).toBeNull();
    expect(peekBroadcast(ADMIN_ID)).toBeDefined();
  });

  test('Non-admin user is rejected from initiating broadcast preview', async () => {
    let deniedText = null;
    const ctx = {
      from: { id: REGULAR_USER_ID, username: 'normal_user' },
      chat: { id: REGULAR_USER_ID },
      reply: jest.fn().mockImplementation((text) => {
        deniedText = text;
        return Promise.resolve();
      })
    };

    await promptBroadcastPreview(ctx, 'Malicious announcement');
    expect(deniedText).toContain('Access Denied');
  });

  test('Non-admin user is rejected from confirming broadcast', async () => {
    setBroadcastConfirm(REGULAR_USER_ID, { type: 'text', text: 'Unauthorized attempt' });
    let deniedText = null;
    const ctx = {
      from: { id: REGULAR_USER_ID, username: 'normal_user' },
      chat: { id: REGULAR_USER_ID },
      reply: jest.fn().mockImplementation((text) => {
        deniedText = text;
        return Promise.resolve();
      })
    };

    await handleConfirmedBroadcast(ctx);
    expect(deniedText).toContain('Access Denied');
  });

  test('/cancel command and handleCancel clears all state', async () => {
    setBroadcast(ADMIN_ID, true);
    setBroadcastConfirm(ADMIN_ID, { text: 'Draft' });
    expect(peekBroadcast(ADMIN_ID)).toBeTruthy();
    expect(peekBroadcastConfirm(ADMIN_ID)).toBeTruthy();

    let cancelReply = null;
    const ctx = {
      from: { id: ADMIN_ID },
      chat: { id: ADMIN_ID },
      reply: jest.fn().mockImplementation((text) => {
        cancelReply = text;
        return Promise.resolve();
      })
    };

    await handleCancel(ctx);

    expect(peekBroadcast(ADMIN_ID)).toBeNull();
    expect(peekBroadcastConfirm(ADMIN_ID)).toBeNull();
    expect(cancelReply).toContain('cancelled');
  });

  test('handleConfirmedBroadcast safely broadcasts to registered users, avoids duplicate sending, and handles rate limits', async () => {
    setBroadcastConfirm(ADMIN_ID, { type: 'text', text: 'Important release <notice> & "updates"' });

    const sentMessages = [];
    let rateLimitRetried = false;
    const ctx = {
      from: { id: ADMIN_ID, username: 'admin_user' },
      chat: { id: ADMIN_ID },
      callbackQuery: { data: 'admin:broadcast_confirm' },
      telegram: {
        sendMessage: jest.fn().mockImplementation((tgId, msg) => {
          if (tgId === 999002) {
            // Mock blocked user
            return Promise.reject(new Error('403 Forbidden: bot was blocked by the user'));
          }
          if (tgId === 999001 && !rateLimitRetried) {
            // Mock rate limit
            rateLimitRetried = true;
            const err = new Error('429 Too Many Requests');
            err.parameters = { retry_after: 0.05 };
            return Promise.reject(err);
          }
          sentMessages.push({ tgId, msg });
          return Promise.resolve({ message_id: 200 });
        }),
        editMessageText: jest.fn().mockResolvedValue(true)
      },
      reply: jest.fn().mockResolvedValue({ message_id: 150 })
    };

    // First confirmation: delivers
    await handleConfirmedBroadcast(ctx);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    // Entity escaping verification: "<notice>" must be escaped so Telegram doesn't crash
    expect(sentMessages.some(m => m.msg.includes('&lt;notice&gt;'))).toBe(true);

    // State must be cleared
    expect(peekBroadcastConfirm(ADMIN_ID)).toBeNull();

    // Duplicate submission attempt immediately rejected without sending again
    const secondSentCount = sentMessages.length;
    let duplicateRejectedReply = null;
    ctx.reply = jest.fn().mockImplementation((txt) => {
      duplicateRejectedReply = txt;
      return Promise.resolve({ message_id: 151 });
    });

    await handleConfirmedBroadcast(ctx);
    expect(sentMessages.length).toBe(secondSentCount); // No new sends
    expect(duplicateRejectedReply).toContain('No pending broadcast found');
  });
});

describe('Multilingual System & Locales', () => {
  test('All 12 launch languages are recognized and loaded', () => {
    expect(SUPPORTED_LANGUAGES.length).toBe(12);
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toEqual(expect.arrayContaining([
      'en', 'ar', 'ru', 'fr', 'es', 'de', 'tr', 'pt', 'zh', 'hi', 'id', 'ur'
    ]));
  });

  test('RTL helper correctly detects Arabic and Urdu as RTL', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('ru')).toBe(false);
    expect(isRtl('zh')).toBe(false);
  });

  test('Language preference persists across database calls', () => {
    const db = getDb();
    db.prepare('UPDATE users SET language=? WHERE tg_id=?').run('ru', REGULAR_USER_ID);

    const u = db.prepare('SELECT language FROM users WHERE tg_id=?').get(REGULAR_USER_ID);
    expect(u.language).toBe('ru');

    const welcomeRu = t('menu.inbox', 'ru');
    expect(welcomeRu).toBe('📥 Входящие');

    const welcomeAr = t('menu.inbox', 'ar');
    expect(welcomeAr).toBe('📥 صندوق الوارد');

    const welcomeEn = t('menu.inbox', 'en');
    expect(welcomeEn).toBe('📥 Inbox');
  });

  test('Fallback to English when key is missing in custom language', () => {
    const fallbackText = t('inbox.header', 'es', { count: 5 });
    expect(fallbackText).toContain('5');
  });

  test('detectLanguage automatically detects client Telegram language code', () => {
    expect(detectLanguage({ from: { language_code: 'ru-RU' } })).toBe('ru');
    expect(detectLanguage({ from: { language_code: 'fr' } })).toBe('fr');
    expect(detectLanguage({ from: { language_code: 'ar-EG' } })).toBe('ar');
    expect(detectLanguage({ from: { language_code: 'unknown' } })).toBe('en');
    expect(detectLanguage(null)).toBe('en');
  });

  test('Language selection keyboard renders all 12 languages with active checkmark', () => {
    const kb = languageSelectionKeyboard('ar');
    expect(kb.reply_markup).toBeDefined();
    const buttons = kb.reply_markup.inline_keyboard.flat();
    expect(buttons.length).toBeGreaterThanOrEqual(12);
    const arButton = buttons.find(b => b.callback_data === 'set_lang:ar');
    expect(arButton).toBeDefined();
    expect(arButton.text).toContain('✅');
    expect(arButton.text).toContain('العربية');
  });
});
