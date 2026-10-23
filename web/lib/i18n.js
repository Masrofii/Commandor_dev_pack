'use client';
import { useState, useEffect, useCallback } from 'react';
import locales from './locales.json';

export const SUPPORTED_LANGUAGES = [
  { id: 'en', code: 'en', name: 'English', native: 'English', flag: '🇬🇧', dir: 'ltr' },
  { id: 'ar', code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { id: 'ru', code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { id: 'fr', code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { id: 'es', code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { id: 'de', code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { id: 'tr', code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { id: 'pt', code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹', dir: 'ltr' },
  { id: 'zh', code: 'zh', name: 'Chinese', native: '简体中文', flag: '🇨🇳', dir: 'ltr' },
  { id: 'hi', code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { id: 'id', code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩', dir: 'ltr' },
  { id: 'ur', code: 'ur', name: 'Urdu', native: 'اردو', flag: '🇵🇰', dir: 'rtl' }
];

export function isRtl(lang) {
  return ['ar', 'ur'].includes(lang);
}

export function getSavedLanguage() {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('language');
    if (saved && SUPPORTED_LANGUAGES.some(l => l.id === saved)) return saved;
    const user = JSON.parse(localStorage.getItem('current_user') || '{}');
    if (user?.language && SUPPORTED_LANGUAGES.some(l => l.id === user.language)) return user.language;
    const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES.some(l => l.id === browserLang)) return browserLang;
  } catch {}
  return 'en';
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

export function translate(key, lang = 'en', varsOrFallback = {}, vars = {}) {
  let fallback = null;
  let actualVars = vars;
  if (typeof varsOrFallback === 'string') {
    fallback = varsOrFallback;
  } else if (typeof varsOrFallback === 'object' && varsOrFallback !== null) {
    actualVars = varsOrFallback;
  }

  const cleanLang = (lang || 'en').toLowerCase().trim();
  const langCatalog = locales[cleanLang] || locales.en || {};
  const enCatalog = locales.en || {};

  let s = resolveCatalogValue(langCatalog, key);
  if (s === undefined) {
    s = resolveCatalogValue(enCatalog, key);
  }
  if (s === undefined) {
    if (fallback !== null) {
      s = fallback;
    } else {
      // NEVER expose raw keys like bot.btn.my_aliases or nav.something to users
      s = humanizeKey(key);
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] Missing web translation key: "${key}" for locale "${cleanLang}" (rendered as: "${s}")`);
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

export function applyLanguage(lang) {
  if (typeof window === 'undefined') return;
  const meta = SUPPORTED_LANGUAGES.find(l => l.id === lang) || SUPPORTED_LANGUAGES[0];
  document.documentElement.lang = meta.id;
  document.documentElement.dir = meta.dir;
  localStorage.setItem('language', meta.id);
  try {
    const user = JSON.parse(localStorage.getItem('current_user') || '{}');
    user.language = meta.id;
    localStorage.setItem('current_user', JSON.stringify(user));
  } catch {}
  window.dispatchEvent(new CustomEvent('app:language-change', { detail: { lang: meta.id, meta } }));
}

export function useTranslation() {
  const [currentLang, setCurrentLang] = useState(() => {
    return getSavedLanguage();
  });

  useEffect(() => {
    const saved = getSavedLanguage();
    if (saved !== currentLang) {
      setCurrentLang(saved);
    }

    const onLangChange = (e) => {
      if (e.detail?.lang) {
        setCurrentLang(e.detail.lang);
      }
    };
    window.addEventListener('app:language-change', onLangChange);
    return () => window.removeEventListener('app:language-change', onLangChange);
  }, [currentLang]);

  const t = useCallback((key, varsOrFallback = {}, vars = {}) => {
    return translate(key, currentLang, varsOrFallback, vars);
  }, [currentLang]);

  const setLanguage = useCallback((langId) => {
    applyLanguage(langId);
    setCurrentLang(langId);
  }, []);

  const meta = SUPPORTED_LANGUAGES.find(l => l.id === currentLang) || SUPPORTED_LANGUAGES[0];

  return {
    t,
    lang: currentLang,
    setLanguage,
    isRtl: isRtl(currentLang),
    meta,
    languages: SUPPORTED_LANGUAGES
  };
}

export default useTranslation;
