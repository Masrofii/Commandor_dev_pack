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

export function translate(key, lang = 'en', vars = {}) {
  const cleanLang = (lang || 'en').toLowerCase().trim();
  const langCatalog = locales[cleanLang] || locales.en || {};
  const enCatalog = locales.en || {};

  let s = langCatalog[key] !== undefined ? langCatalog[key] : (enCatalog[key] !== undefined ? enCatalog[key] : key);

  if (typeof s === 'string') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== undefined && v !== null ? v : '');
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
  const [currentLang, setCurrentLang] = useState('en');

  useEffect(() => {
    const initial = getSavedLanguage();
    setCurrentLang(initial);

    const onLangChange = (e) => {
      if (e.detail?.lang) {
        setCurrentLang(e.detail.lang);
      }
    };
    window.addEventListener('app:language-change', onLangChange);
    return () => window.removeEventListener('app:language-change', onLangChange);
  }, []);

  const t = useCallback((key, vars = {}) => {
    return translate(key, currentLang, vars);
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
