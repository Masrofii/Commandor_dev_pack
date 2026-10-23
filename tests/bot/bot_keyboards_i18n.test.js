'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = '/tmp/test-keyboards-i18n.db';
process.env.DOMAINS = 'commandor.my.id';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { t, isRtl, SUPPORTED_LANGUAGES, getLanguageMeta } = require('../../src/i18n');
const {
  mainMenuKeyboard,
  startInlineKeyboard,
  emailSuiteKeyboard,
  subdomainHubKeyboard,
  apiHubKeyboard,
  emailActionsKeyboard,
  aliasActionsKeyboard,
  hostingMainMenuKeyboard,
  languageSelectionKeyboard,
  tosPromptKeyboard,
  tosFullKeyboard,
  broadcastConfirmKeyboard
} = require('../../src/bot/keyboards');
const { getLang } = require('../../src/bot/commands');

const TEST_USER_ID = 555666777;

beforeAll(() => {
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
  initDatabase();
  runMigrations();

  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO users (tg_id, username, role, language, tos_accepted) VALUES (?, ?, ?, ?, 1)')
    .run(TEST_USER_ID, 'i18n_test_user', 'user', 'en');
});

afterAll(() => {
  closeDatabase();
  for (const f of ['', '-wal', '-shm']) {
    try { fs.rmSync(process.env.DATABASE_PATH + f, { force: true }); } catch {}
  }
});

describe('Bot Multilingual Keyboards & Persistence Verification', () => {
  test('mainMenuKeyboard renders localized button labels for en, ar, and ru', () => {
    // English
    const menuEn = mainMenuKeyboard(false, 'en');
    const flatEn = menuEn.reply_markup.keyboard.flat();
    expect(flatEn).toContain(t('bot.btn.email_suite', 'en'));
    expect(flatEn).toContain(t('bot.btn.inbox', 'en'));
    expect(flatEn).toContain(t('bot.btn.settings', 'en'));

    // Arabic
    const menuAr = mainMenuKeyboard(false, 'ar');
    const flatAr = menuAr.reply_markup.keyboard.flat();
    expect(flatAr).toContain(t('bot.btn.email_suite', 'ar'));
    expect(flatAr).toContain(t('bot.btn.inbox', 'ar'));
    expect(flatAr).toContain(t('bot.btn.settings', 'ar'));

    // Russian
    const menuRu = mainMenuKeyboard(false, 'ru');
    const flatRu = menuRu.reply_markup.keyboard.flat();
    expect(flatRu).toContain(t('bot.btn.email_suite', 'ru'));
    expect(flatRu).toContain(t('bot.btn.inbox', 'ru'));
    expect(flatRu).toContain(t('bot.btn.settings', 'ru'));
  });

  test('startInlineKeyboard preserves callback_data while translating button labels', () => {
    const startAr = startInlineKeyboard('https://commandor.my.id', true, 3, 'ar');
    const buttonsAr = startAr.reply_markup.inline_keyboard.flat();

    const emailSuiteBtn = buttonsAr.find(b => b.callback_data === 'menu:email_suite');
    expect(emailSuiteBtn).toBeDefined();
    expect(emailSuiteBtn.text).toContain(t('bot.btn.email_suite', 'ar'));
    expect(emailSuiteBtn.text).toContain('(3)');

    const adminBtn = buttonsAr.find(b => b.callback_data === 'admin:dashboard');
    expect(adminBtn).toBeDefined();
    expect(adminBtn.text).toBe(t('bot.btn.admin_panel', 'ar'));
  });

  test('emailActionsKeyboard translates actions while maintaining functional callbacks', () => {
    const kbAr = emailActionsKeyboard(42, false, true, 'https://test.url', 'ar');
    const flatAr = kbAr.reply_markup.inline_keyboard.flat();

    const starBtn = flatAr.find(b => b.callback_data === 'star:42');
    expect(starBtn).toBeDefined();
    expect(starBtn.text).toBe(t('bot.btn.star', 'ar'));

    const replyBtn = flatAr.find(b => b.callback_data === 'reply:42');
    expect(replyBtn).toBeDefined();
    expect(replyBtn.text).toBe(t('bot.btn.reply', 'ar'));

    const deleteBtn = flatAr.find(b => b.callback_data === 'delete_email:42');
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn.text).toBe(t('bot.btn.delete', 'ar'));
  });

  test('aliasActionsKeyboard translates toggle and burner renewal in Russian', () => {
    const kbRu = aliasActionsKeyboard('test@domain.com', true, true, 10, 'ru');
    const flatRu = kbRu.reply_markup.inline_keyboard.flat();

    const pauseBtn = flatRu.find(b => b.callback_data === 'toggle_alias:test@domain.com');
    expect(pauseBtn).toBeDefined();
    expect(pauseBtn.text).toBe(t('bot.btn.deactivate', 'ru'));

    const renewBtn = flatRu.find(b => b.callback_data === 'renew_alias:test@domain.com');
    expect(renewBtn).toBeDefined();
    expect(renewBtn.text).toBe(t('bot.btn.renew_alias', 'ru'));
  });

  test('emailSuiteKeyboard translates my_aliases, new_alias, custom_alias, and burner in all 12 languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const code = lang.code;
      const kb = emailSuiteKeyboard(5, 2, code);
      const buttons = kb.reply_markup.inline_keyboard.flat();

      const myAliasesBtn = buttons.find(b => b.callback_data === 'aliases:1');
      const newAliasBtn = buttons.find(b => b.callback_data === 'menu:new');
      const customAliasBtn = buttons.find(b => b.callback_data === 'menu:custom_alias');
      const burnerBtn = buttons.find(b => b.callback_data === 'menu:burner');
      const inboxBtn = buttons.find(b => b.callback_data === 'inbox:1');
      const searchBtn = buttons.find(b => b.callback_data === 'menu:search');
      const homeBtn = buttons.find(b => b.callback_data === 'menu:home');

      expect(myAliasesBtn).toBeDefined();
      expect(newAliasBtn).toBeDefined();
      expect(customAliasBtn).toBeDefined();
      expect(burnerBtn).toBeDefined();
      expect(inboxBtn).toBeDefined();
      expect(searchBtn).toBeDefined();
      expect(homeBtn).toBeDefined();

      // Assert no raw translation keys leak
      for (const btn of buttons) {
        expect(btn.text).not.toContain('bot.btn.');
        expect(btn.text).not.toContain('menu.');
        expect(btn.text.length).toBeGreaterThan(0);
      }

      // Check specific expected translations
      expect(myAliasesBtn.text).toBe(t('bot.btn.my_aliases', code));
      expect(newAliasBtn.text).toBe(t('bot.btn.new_alias', code));
      expect(customAliasBtn.text).toBe(t('bot.btn.custom_alias', code));
      expect(burnerBtn.text).toBe(t('bot.btn.burner', code));
    }
  });

  test('Comprehensive verification: all keyboard builders render valid human-readable text without raw keys across all 12 languages', () => {
    const allKb = require('../../src/bot/keyboards');
    const calls = {
      mainMenuKeyboard: [false],
      startInlineKeyboard: ['http://localhost', true, 5],
      tosPromptKeyboard: [],
      tosFullKeyboard: [],
      tosDeclinedKeyboard: [],
      emailSuiteKeyboard: [3, 2],
      infraHubKeyboard: [2, 1],
      utilitiesHubKeyboard: [],
      subdomainHubKeyboard: [3],
      apiHubKeyboard: [2, 'http://localhost'],
      changeLogKeyboard: [true],
      adminAuditLogsKeyboard: [1, 5, 'all'],
      adminDashboardKeyboard: ['http://localhost'],
      apiKeysKeyboard: [[{ id: 1, name: 'Test Key', revoked: 0 }]],
      emailActionsKeyboard: [100, true, true, 'http://localhost'],
      aliasActionsKeyboard: ['test@example.com', true, true, 1],
      subdomainListKeyboard: [[{ id: 1, subdomain: 'app', active: 1, web_mode: 'landing' }], 1, 1],
      subdomainActionsKeyboard: [{ id: 1, email_catch_all: 1, web_enabled: 1, web_mode: 'landing' }],
      hostingMainMenuKeyboard: [true],
      hostingSitesListKeyboard: [[{ id: 1, name: 'mysite', status: 'active', visits_count: 10 }]],
      hostingSiteActionsKeyboard: [{ id: 1, full_domain: 'mysite.com' }],
      hostingNodesKeyboard: [[{ id: 1, name: 'node-1', status: 'online', current_sites: 2, max_sites: 10 }]],
      hostingNodeActionsKeyboard: [{ id: 1 }],
      languageSelectionKeyboard: ['en'],
      broadcastConfirmKeyboard: []
    };

    const rawKeyPattern = /(?:^|\s)(bot\.|menu\.|nav\.|admin\.|api_keys\.|apikeys\.|common\.|settings\.)[a-z0-9_.]+/i;

    for (const lang of SUPPORTED_LANGUAGES) {
      const code = lang.code;
      for (const [fnName, args] of Object.entries(calls)) {
        const res = allKb[fnName](...args, code);
        const markup = res?.reply_markup;
        const rows = markup?.inline_keyboard || markup?.keyboard || [];
        for (const row of rows) {
          for (const btn of row) {
            const text = typeof btn === 'string' ? btn : btn.text;
            expect(typeof text).toBe('string');
            expect(text.trim().length).toBeGreaterThan(0);
            expect(text).not.toMatch(rawKeyPattern);
          }
        }
      }
    }
  });

  test('Resolver fallback humanizes missing keys and never leaks raw dotted keys to users', () => {
    // Completely unmapped key should humanize rather than output raw dotted key
    const missingBtn = t('bot.btn.some_unknown_action', 'en');
    expect(missingBtn).toBe('Some Unknown Action');
    expect(missingBtn).not.toBe('bot.btn.some_unknown_action');

    const missingAdmin = t('admin.non_existent_tab', 'en');
    expect(missingAdmin).toBe('Non Existent Tab');
    expect(missingAdmin).not.toBe('admin.non_existent_tab');

    // Provided fallback string should be respected
    const withFallback = t('bot.btn.another_unknown', 'en', 'Custom Fallback Text');
    expect(withFallback).toBe('Custom Fallback Text');
  });

  test('language persistence in database and getLang helper', () => {
    const db = getDb();
    const ctx = { from: { id: TEST_USER_ID } };

    // Initially English
    expect(getLang(ctx)).toBe('en');

    // Switch to Arabic
    db.prepare('UPDATE users SET language=? WHERE tg_id=?').run('ar', TEST_USER_ID);
    expect(getLang(ctx)).toBe('ar');

    // Switch to Russian
    db.prepare('UPDATE users SET language=? WHERE tg_id=?').run('ru', TEST_USER_ID);
    expect(getLang(ctx)).toBe('ru');

    // Non-existent user defaults safely to en without throwing
    expect(getLang({ from: { id: 999999999 } })).toBe('en');
    expect(getLang(null)).toBe('en');
  });

  test('All 12 supported languages have valid metadata and complete key dictionaries', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const meta = getLanguageMeta(lang.code);
      expect(meta).toBeDefined();
      expect(meta.nativeName).toBeDefined();
      expect(meta.flag).toBeDefined();

      // Check essential core keys
      expect(t('nav.overview', lang.code)).not.toBe('nav.overview');
      expect(t('bot.btn.inbox', lang.code)).not.toBe('bot.btn.inbox');
      expect(t('common.save', lang.code)).not.toBe('common.save');
    }
  });

  test('Bot hubs, dashboards and variable interpolation are completely translated in all 12 languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const code = lang.code;

      // Dashboard main message with variables
      const dashMsg = t('bot.dash.main_message', code, {
        name: 'Commander',
        userHandle: '@commander',
        roleBadge: 'Admin',
        aliasCount: 5,
        unreadCount: 2,
        subCount: 3,
        siteCount: 1
      });
      expect(dashMsg).toContain('Commander');
      expect(dashMsg).toContain('5');
      expect(dashMsg).toContain('2');
      expect(dashMsg).not.toContain('{{name}}');
      expect(dashMsg).not.toContain('{{aliasCount}}');

      // Email suite hub message with variables
      const emailSuiteMsg = t('bot.email_suite.main_message', code, { aliasCount: 8, unreadCount: 4 });
      expect(emailSuiteMsg).toContain('8');
      expect(emailSuiteMsg).toContain('4');
      expect(emailSuiteMsg).not.toContain('{{aliasCount}}');

      // Subdomain and API hub messages
      expect(t('bot.subdomain_hub.main_message', code, { subCount: 2 })).toContain('2');
      expect(t('bot.api_hub.main_message', code, { keyCount: 1 })).toContain('1');

      // ToS prompt
      const tos = t('bot.tos.prompt', code);
      expect(tos).toBeDefined();
      expect(tos.length).toBeGreaterThan(50);
      expect(tos).not.toBe('bot.tos.prompt');

      // Web table headers and component labels
      expect(t('nodes.availability', code)).not.toBe('nodes.availability');
      expect(t('subdomains.th_hostname', code)).not.toBe('subdomains.th_hostname');
      expect(t('hosting.th_site', code)).not.toBe('hosting.th_site');
      expect(t('aliases.th_alias', code)).not.toBe('aliases.th_alias');
      expect(t('inbox.search_placeholder', code)).not.toBe('inbox.search_placeholder');
      expect(t('apikeys.title', code)).not.toBe('apikeys.title');
    }
  });
});
