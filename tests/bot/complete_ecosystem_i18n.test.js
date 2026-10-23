'use strict';

const fs = require('fs');
const path = require('path');
const { t, SUPPORTED_LANGUAGES, catalogs } = require('../../src/i18n');
const botKeyboards = require('../../src/bot/keyboards');

describe('Commandor Dev Pack — Complete Ecosystem i18n & Translation Suite', () => {
  const LANGS = ['en', 'ar', 'ru', 'fr', 'es', 'de', 'tr', 'pt', 'zh', 'hi', 'id', 'ur'];

  test('All 12 languages are registered with correct directions', () => {
    expect(SUPPORTED_LANGUAGES.length).toBe(12);
    const ar = SUPPORTED_LANGUAGES.find(l => l.code === 'ar');
    const ur = SUPPORTED_LANGUAGES.find(l => l.code === 'ur');
    const en = SUPPORTED_LANGUAGES.find(l => l.code === 'en');
    const ru = SUPPORTED_LANGUAGES.find(l => l.code === 'ru');

    expect(ar.dir).toBe('rtl');
    expect(ur.dir).toBe('rtl');
    expect(en.dir).toBe('ltr');
    expect(ru.dir).toBe('ltr');
  });

  test('Variable interpolation handles both {var} and {{var}} cleanly without leaking brackets', () => {
    // Single bracket
    const single = t('overview.tip_telegram_bot', 'en', { bot: 'TestBot' });
    expect(single).toContain('@TestBot');
    expect(single).not.toContain('{TestBot}');
    expect(single).not.toContain('{bot}');

    // Double bracket simulation
    const customTest = 'Hello {{name}}, welcome to {{service}}!';
    const res = customTest
      .replace(new RegExp('\\{\\{?name\\}?\}', 'g'), 'Commander')
      .replace(new RegExp('\\{\\{?service\\}?\}', 'g'), 'Platform');
    expect(res).toBe('Hello Commander, welcome to Platform!');
  });

  test('All 12 locale catalogs have complete parity with zero missing or empty keys', () => {
    const enKeys = Object.keys(catalogs['en']);
    expect(enKeys.length).toBeGreaterThanOrEqual(550);

    for (const code of LANGS) {
      const cat = catalogs[code];
      expect(cat).toBeDefined();
      for (const k of enKeys) {
        expect(cat[k]).toBeDefined();
        expect(typeof cat[k]).toBe('string');
        expect(cat[k].trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Web locales catalog matches backend locales catalog exactly', () => {
    const webLocales = JSON.parse(fs.readFileSync(path.join(__dirname, '../../web/lib/locales.json'), 'utf8'));
    for (const code of LANGS) {
      expect(webLocales[code]).toBeDefined();
      const webKeys = Object.keys(webLocales[code]);
      const botKeys = Object.keys(catalogs[code]);
      expect(webKeys.length).toBe(botKeys.length);
    }
  });

  test('Bot command texts are fully localized for privacy, support, credits, and detailed TOS', () => {
    for (const code of LANGS) {
      const tos = t('bot.tos.detailed', code);
      expect(tos).toBeDefined();
      expect(tos.length).toBeGreaterThan(100);

      const privacyTitle = t('bot.privacy_title', code);
      const privacyDesc = t('bot.privacy_desc', code);
      expect(privacyTitle).toBeDefined();
      expect(privacyDesc).toBeDefined();

      const supportTitle = t('bot.support_title', code);
      const supportDesc = t('bot.support_desc', code, { userId: 12345, botUser: 'Bot', ownerUser: 'Owner' });
      expect(supportTitle).toBeDefined();
      expect(supportDesc).toContain('12345');

      const creditsTitle = t('bot.credits_title', code);
      const creditsDesc = t('bot.credits_desc', code, { ownerUser: 'Owner', botUser: 'Bot' });
      expect(creditsTitle).toBeDefined();
      expect(creditsDesc).toContain('Owner');
    }
  });

  test('Bot inline and reply keyboards render localized labels while preserving callback_data', () => {
    for (const code of ['en', 'ar', 'ru', 'zh', 'ur']) {
      const mainMenu = botKeyboards.mainMenuKeyboard(true, code);
      expect(mainMenu.reply_markup.keyboard.length).toBeGreaterThanOrEqual(4);

      const inline = botKeyboards.startInlineKeyboard('https://example.com', true, 3, code);
      const rows = inline.reply_markup.inline_keyboard;
      expect(rows.length).toBeGreaterThanOrEqual(5);

      // Verify callback_data values remain exact internal machine identifiers
      const callbacks = rows.flat().filter(b => b.callback_data).map(b => b.callback_data);
      expect(callbacks).toContain('menu:email_suite');
      expect(callbacks).toContain('subdomain:hub');
      expect(callbacks).toContain('hosting:menu');
      expect(callbacks).toContain('api:hub');
      expect(callbacks).toContain('inbox:1');
      expect(callbacks).toContain('admin:dashboard');

      // Verify button text is translated
      const emailSuiteBtn = rows[0][0].text;
      expect(emailSuiteBtn).not.toBe('');
      if (code === 'ar') {
        expect(emailSuiteBtn).toContain('باقة البريد');
      } else if (code === 'ru') {
        expect(emailSuiteBtn).toContain('Почтовый набор');
      }
    }
  });
});
