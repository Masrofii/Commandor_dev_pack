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

function isRtl(lang) {
  return ['ar', 'ur'].includes(lang);
}

function getLanguageMeta(code) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
}

function t(key, lang = 'en', vars = {}) {
  const cleanLang = (lang || 'en').toLowerCase().trim();
  const langCatalog = catalogs[cleanLang] || catalogs.en || {};
  const enCatalog = catalogs.en || {};

  let s = langCatalog[key] !== undefined ? langCatalog[key] : (enCatalog[key] !== undefined ? enCatalog[key] : key);

  if (typeof s === 'string') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== undefined && v !== null ? v : '');
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
  getLanguageMeta,
  detectLanguage,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CODES,
  catalogs,
  translations: catalogs
};
