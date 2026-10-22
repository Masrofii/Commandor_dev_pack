'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  LanguageIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  KeyIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { SUPPORTED_LANGUAGES, applyLanguage, getSavedLanguage, useTranslation } from '../../../lib/i18n';

export default function SettingsPage() {
  const [theme, setTheme] = useState('system');
  const { t, lang, setLanguage, languages } = useTranslation();

  useEffect(() => {
    setTheme(localStorage.getItem('theme') || 'system');
  }, []);

  function changeTheme(tMode) {
    setTheme(tMode);
    localStorage.setItem('theme', tMode);
    const r = document.documentElement;
    if (tMode === 'dark') {
      r.classList.add('dark');
    } else if (tMode === 'light') {
      r.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        r.classList.add('dark');
      } else {
        r.classList.remove('dark');
      }
    }
    toast.success(`Theme updated to ${tMode}`);
  }

  function changeLanguage(item) {
    setLanguage(item.id);
    api.updateProfile({ language: item.id }).catch(() => {});
    toast.success(`Language set to ${item.flag} ${item.native}`);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Account & Preferences
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Customize your appearance, interface language, security sessions, and Telegram bot integrations
        </p>
      </div>

      {/* Appearance Settings */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <SunIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
            <span>Theme & Visual Mode</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select your preferred color theme for Commandor Mail
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'light', label: 'Light', icon: SunIcon },
            { id: 'dark', label: 'Dark (Cyber)', icon: MoonIcon },
            { id: 'system', label: 'System Default', icon: ComputerDesktopIcon },
          ].map((item) => {
            const Icon = item.icon;
            const active = theme === item.id;
            return (
              <button
                key={item.id}
                onClick={() => changeTheme(item.id)}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                  active
                    ? 'border-indigo-600 dark:border-cyan-500 bg-indigo-50/50 dark:bg-cyber-850 text-indigo-700 dark:text-cyan-400 font-semibold shadow-sm'
                    : 'border-slate-200 dark:border-cyber-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-cyber-700'
                }`}
              >
                <Icon className="w-5 h-5 mb-2" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Language Settings */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <LanguageIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
            <span>Interface Language</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose your display language across the dashboard
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {SUPPORTED_LANGUAGES.map((item) => {
            const active = lang === item.id;
            return (
              <button
                key={item.id}
                onClick={() => changeLanguage(item)}
                className={`py-3 px-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between gap-2 ${
                  active
                    ? 'border-indigo-600 dark:border-cyan-500 bg-indigo-50/50 dark:bg-cyber-850 text-indigo-700 dark:text-cyan-400 shadow-sm ring-1 ring-cyan-500/20'
                    : 'border-slate-200 dark:border-cyber-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-cyber-700 hover:bg-slate-50/50 dark:hover:bg-cyber-800/40'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="text-base">{item.flag}</span>
                  <span className="font-bold">{item.native}</span>
                </span>
                {active && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Sessions & Security Quick Card */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
            <span>Security & Sessions</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review active login sessions, IP addresses, and revoke tokens
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Active Browser & Mobile Sessions
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Manage cryptographic session tokens stored across your devices.
            </p>
          </div>
          <Link
            href="/sessions"
            className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
          >
            <span>Manage Sessions</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Telegram Bot Sync Card */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <CommandLineIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
            <span>Telegram Bot Integration</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Receive push notifications and manage temporary aliases straight from Telegram
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-cyber-950 p-4 rounded-xl border border-slate-200/80 dark:border-cyber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="font-bold text-xs text-slate-900 dark:text-white">
              Official Commandor Mail Bot
            </div>
            <div className="text-xs text-cyan-600 dark:text-cyan-400 font-mono mt-0.5">
              @commandor_mail_bot
            </div>
          </div>
          <a
            href="https://t.me/commandor_mail_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary py-1.5 px-4 text-xs font-semibold shadow-sm"
          >
            Open Telegram Bot ↗
          </a>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Quick Bot Commands:</p>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            <div className="bg-white dark:bg-cyber-900 p-2 rounded-lg border border-slate-200 dark:border-cyber-800">
              <span className="text-indigo-600 dark:text-cyan-400 font-bold">/new</span> — Instant alias
            </div>
            <div className="bg-white dark:bg-cyber-900 p-2 rounded-lg border border-slate-200 dark:border-cyber-800">
              <span className="text-rose-500 font-bold">/burner</span> — 1-hour email
            </div>
            <div className="bg-white dark:bg-cyber-900 p-2 rounded-lg border border-slate-200 dark:border-cyber-800">
              <span className="text-indigo-600 dark:text-cyan-400 font-bold">/inbox</span> — Check mail & codes
            </div>
            <div className="bg-white dark:bg-cyber-900 p-2 rounded-lg border border-slate-200 dark:border-cyber-800">
              <span className="text-indigo-600 dark:text-cyan-400 font-bold">/login</span> — Web login link
            </div>
          </div>
        </div>
      </div>

      {/* Progressive Web App Card */}
      <div className="card p-5 sm:p-6 bg-gradient-to-r from-indigo-50/50 to-cyan-50/50 dark:from-cyber-900 dark:to-cyber-850 border-indigo-100 dark:border-cyber-800 flex items-start gap-3.5">
        <div className="p-2 rounded-xl bg-indigo-600 text-white flex-shrink-0">
          <DevicePhoneMobileIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Install as Mobile / Desktop App
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Commandor Mail is a Progressive Web App (PWA). You can install it on your iOS, Android, or desktop browser for instant home screen access and offline readiness.
          </p>
        </div>
      </div>
    </div>
  );
}
