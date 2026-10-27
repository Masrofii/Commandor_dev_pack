'use client';

import { useCallback, useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'theme';
export const THEME_MODES = ['system', 'light', 'dark'];

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode) {
  if (typeof window === 'undefined') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode) {
  if (typeof window === 'undefined') return 'light';
  const safeMode = THEME_MODES.includes(mode) ? mode : 'system';
  const resolved = resolveTheme(safeMode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, safeMode);
  } catch {}
  window.dispatchEvent(new CustomEvent('app:theme-change', { detail: { mode: safeMode, resolved } }));
  return resolved;
}

export function useTheme() {
  const [mode, setModeState] = useState('system');
  const [resolved, setResolved] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = getStoredTheme();
    setModeState(initial);
    setResolved(applyTheme(initial));
    setReady(true);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getStoredTheme() === 'system') {
        setResolved(applyTheme('system'));
      }
    };
    const onExternalChange = (event) => {
      const next = event?.detail?.mode;
      if (THEME_MODES.includes(next)) {
        setModeState(next);
        setResolved(resolveTheme(next));
      }
    };

    media.addEventListener?.('change', onSystemChange);
    window.addEventListener('app:theme-change', onExternalChange);
    return () => {
      media.removeEventListener?.('change', onSystemChange);
      window.removeEventListener('app:theme-change', onExternalChange);
    };
  }, []);

  const setMode = useCallback((nextMode) => {
    const safeMode = THEME_MODES.includes(nextMode) ? nextMode : 'system';
    setModeState(safeMode);
    setResolved(applyTheme(safeMode));
  }, []);

  const toggle = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setMode(next);
  }, [resolved, setMode]);

  return { mode, resolved, isDark: resolved === 'dark', ready, setMode, toggle };
}

export default useTheme;
