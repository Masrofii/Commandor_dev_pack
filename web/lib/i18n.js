'use strict';

export const SUPPORTED_LANGUAGES = [
  { id: 'en', name: 'English', native: 'English', flag: '🇬🇧', dir: 'ltr' },
  { id: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { id: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { id: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { id: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { id: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { id: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { id: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹', dir: 'ltr' },
  { id: 'zh', name: 'Chinese', native: '简体中文', flag: '🇨🇳', dir: 'ltr' },
  { id: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { id: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩', dir: 'ltr' },
  { id: 'ur', name: 'Urdu', native: 'اردو', flag: '🇵🇰', dir: 'rtl' }
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
  } catch {}
  return 'en';
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
}
