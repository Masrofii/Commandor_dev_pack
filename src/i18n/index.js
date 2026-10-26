'use strict';

const fs = require('fs');
const path = require('path');

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '简体中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', dir: 'ltr' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', dir: 'rtl' }
];

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map(l => l.code));

// Load all catalogs
const localesDir = path.join(__dirname, 'locales');
const catalogs = {};

for (const lang of SUPPORTED_LANGUAGES) {
  const filePath = path.join(localesDir, `${lang.code}.json`);
  try {
    if (fs.existsSync(filePath)) {
      catalogs[lang.code] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      catalogs[lang.code] = {};
    }
  } catch (err) {
    console.error(`Failed to load translation catalog for ${lang.code}:`, err.message);
    catalogs[lang.code] = {};
  }
}

// Namespace aliases and synonyms to resolve legacy or alternative key conventions
const KEY_ALIASES = {
  'bot.btn.my_aliases': 'menu.aliases',
  'bot.btn.new_alias': 'menu.new_alias',
  'bot.btn.create_alias': 'menu.new_alias',
  'bot.btn.custom_alias': 'menu.custom_alias',
  'bot.btn.burner': 'menu.burner',
  'bot.btn.home': 'bot.btn.main_menu',
  'bot.btn.main_menu': 'bot.btn.home',
  'bot.btn.view_inbox': 'bot.btn.inbox',
  'bot.btn.cancel': 'common.cancel',
  'bot.btn.refresh': 'common.refresh',
  'bot.btn.all': 'common.all',
  'bot.btn.help': 'menu.help',
  'bot.btn.tos': 'bot.btn.read_tos',
  'bot.btn.export': 'export.title',
  'api_keys.title': 'apikeys.title',
  'api_keys.generate_btn': 'apikeys.create_btn',
  'api_keys.docs_title': 'apikeys.docs_title',
  'api_keys.subtitle': 'apikeys.subtitle',
  'admin.tab_sites': 'admin.tab_hosting',
  'admin.stat_threats': 'admin.stat_threats_blocked'
};

function humanizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (!key.includes('.') && !key.includes('_')) return key;

  let segment = key;
  if (segment.startsWith('bot.btn.') || segment.startsWith('menu.') || segment.startsWith('nav.')) {
    segment = segment.split('.').slice(2).join(' ') || segment.split('.').pop();
  } else if (segment.includes('.')) {
    segment = segment.split('.').slice(1).join(' ') || segment.split('.').pop();
  }

  return segment
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function resolveCatalogValue(catalog, key) {
  if (!catalog || typeof catalog !== 'object') return undefined;

  // 1. Direct key match
  if (catalog[key] !== undefined) return catalog[key];

  // 2. Alias match
  const alias = KEY_ALIASES[key];
  if (alias && catalog[alias] !== undefined) return catalog[alias];

  // 3. Nested dot path lookup if catalog is structured as a nested object
  if (key.includes('.')) {
    const parts = key.split('.');
    let cur = catalog;
    for (const p of parts) {
      if (cur && typeof cur === 'object') {
        cur = cur[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === 'string') return cur;
  }

  return undefined;
}

function isRtl(lang) {
  return ['ar', 'ur'].includes(lang);
}

function validateLanguage(code) {
  if (typeof code !== 'string') return false;
  return SUPPORTED_CODES.has(code.toLowerCase().trim());
}

function getLanguageMeta(code) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
}

function t(key, lang = 'en', varsOrFallback = {}, vars = {}) {
  let fallback = null;
  let actualVars = vars;
  if (typeof varsOrFallback === 'string') {
    fallback = varsOrFallback;
  } else if (typeof varsOrFallback === 'object' && varsOrFallback !== null) {
    actualVars = varsOrFallback;
  }

  const cleanLang = (lang || 'en').toLowerCase().trim();
  const langCatalog = catalogs[cleanLang] || catalogs.en || {};
  const enCatalog = catalogs.en || {};

  let s = resolveCatalogValue(langCatalog, key);
  if (s === undefined) {
    s = resolveCatalogValue(enCatalog, key);
  }
  if (s === undefined) {
    if (fallback !== null) {
      s = fallback;
    } else {
      // NEVER expose raw keys like bot.btn.my_aliases to users
      s = humanizeKey(key);
      if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_I18N) {
        console.warn(`[i18n] Missing translation key: "${key}" for locale "${cleanLang}" (rendered as: "${s}")`);
      }
    }
  }

  if (typeof s === 'string' && actualVars && typeof actualVars === 'object') {
    for (const [k, v] of Object.entries(actualVars)) {
      s = s.replace(new RegExp(`\\{\\{?${k}\\}?\\}`, 'g'), v !== undefined && v !== null ? v : '');
    }
  }
  return s;
}

function detectLanguage(ctx) {
  if (!ctx) return 'en';
  try {
    // 1. Check user record in database if available
    const { getDb } = require('../../database/database');
    const db = getDb();
    if (ctx.from?.id) {
      const u = db.prepare('SELECT language FROM users WHERE tg_id=?').get(ctx.from.id);
      if (u?.language && SUPPORTED_CODES.has(u.language)) {
        return u.language;
      }
    }
  } catch {}

  // 2. Check Telegram language code e.g. "ru-RU", "ar", "fr"
  const tgLang = (ctx.from?.language_code || '').toLowerCase().slice(0, 2);
  if (tgLang && SUPPORTED_CODES.has(tgLang)) {
    return tgLang;
  }

  return 'en';
}

module.exports = {
  t,
  isRtl,
  validateLanguage,
  getLanguageMeta,
  detectLanguage,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CODES,
  catalogs,
  translations: catalogs
};
