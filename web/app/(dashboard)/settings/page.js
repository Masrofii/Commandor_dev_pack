'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  LanguageIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  KeyIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  TicketIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { SUPPORTED_LANGUAGES, applyLanguage, getSavedLanguage, useTranslation } from '../../../lib/i18n';
import VoucherRedeemCard from '../../../components/VoucherRedeemCard';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('preferences'); // 'preferences' | 'logs'
  const [theme, setTheme] = useState('system');
  const { t, lang, setLanguage, languages } = useTranslation();

  // Audit Logs State
  const [logSearch, setLogSearch] = useState('');
  const [logCategory, setLogCategory] = useState('all');

  const { data: auditData, isLoading: loadingLogs, mutate: mutateLogs } = useSWR(
    activeTab === 'logs' ? ['audit-logs', logCategory, logSearch] : null,
    () => api.getAuditLogs({
      category: logCategory !== 'all' ? logCategory : undefined,
      search: logSearch.trim() || undefined,
      limit: 100
    })
  );

  const logs = auditData?.logs || [];

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 pb-24 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('settings.title', 'Settings & Audit Logs')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('settings.subtitle', 'Customize platform appearance, language preferences, sessions, and review immutable system audit logs.')}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'preferences'
                ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('settings.tab_preferences', 'Preferences & Security')}
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'subscription'
                ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5" />
            <span>{t('voucher.title', 'Subscription & Vouchers')}</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <DocumentTextIcon className="w-3.5 h-3.5" />
            <span>{t('settings.tab_logs', 'Audit Trail')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'preferences' ? (
        <div className="space-y-6">
          {/* Appearance Settings */}
          <div className="card p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <SunIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                <span>{t('settings.theme_title', 'Theme & Visual Mode')}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('settings.theme_desc', 'Select your preferred color theme for Commandor Dev Pack')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'light', label: t('settings.theme_light', 'Light'), icon: SunIcon },
                { id: 'dark', label: t('settings.theme_dark', 'Dark (Cyber)'), icon: MoonIcon },
                { id: 'system', label: t('settings.theme_system', 'System Default'), icon: ComputerDesktopIcon },
              ].map((item) => {
                const Icon = item.icon;
                const active = theme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => changeTheme(item.id)}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                      active
                        ? 'border-indigo-600 dark:border-cyan-500 bg-indigo-50/50 dark:bg-cyber-850 text-indigo-700 dark:text-cyan-400 font-semibold shadow-xs'
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
                <span>{t('settings.language_title', 'Interface Language')}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('settings.language_desc', 'Choose your display language across the dashboard')}
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
                        ? 'border-indigo-600 dark:border-cyan-500 bg-indigo-50/50 dark:bg-cyber-850 text-indigo-700 dark:text-cyan-400 shadow-xs ring-1 ring-cyan-500/20'
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
                <span>Security &amp; Sessions</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review active login sessions, IP addresses, and revoke tokens
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Active Browser &amp; Mobile Sessions
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
                  Official Commandor Dev Pack Bot
                </div>
                <div className="text-xs text-cyan-600 dark:text-cyan-400 font-mono mt-0.5">
                  @{process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot'}
                </div>
              </div>
              <a
                href={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary py-1.5 px-4 text-xs font-semibold shadow-xs"
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
                  <span className="text-indigo-600 dark:text-cyan-400 font-bold">/inbox</span> — Check mail &amp; codes
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
                Commandor Dev Pack is a Progressive Web App (PWA). You can install it on your iOS, Android, or desktop browser for instant home screen access and offline readiness.
              </p>
            </div>
          </div>
        </div>
      ) : activeTab === 'subscription' ? (
        <div className="animate-fade-in">
          <VoucherRedeemCard />
        </div>
      ) : (
        /* AUDIT LOGS TAB */
        <div className="space-y-4 animate-fade-in">
          {/* Filter Bar */}
          <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs border-slate-200 dark:border-cyber-800">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail by action or details..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="input pl-9 text-xs w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logCategory}
                onChange={(e) => setLogCategory(e.target.value)}
                className="input text-xs"
              >
                <option value="all">All Categories</option>
                <option value="node">Nodes</option>
                <option value="subdomain">Subdomains</option>
                <option value="domain">Domains &amp; DNS</option>
                <option value="application">Applications</option>
                <option value="backup">Backups</option>
                <option value="auth">Authentication</option>
                <option value="tos">Terms of Service</option>
              </select>

              <button
                onClick={() => mutateLogs()}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                title="Refresh audit logs"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="card overflow-hidden border-slate-200 dark:border-cyber-800 shadow-xs">
            {loadingLogs ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading audit records...</div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <DocumentTextIcon className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No audit records found</h4>
                <p className="text-xs text-slate-500">Mutations and administrative events will appear here in chronological order.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-cyber-900 border-b border-slate-200 dark:border-cyber-800 text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Timestamp</th>
                      <th className="py-2.5 px-3 font-sans">Category</th>
                      <th className="py-2.5 px-3 font-sans">Action</th>
                      <th className="py-2.5 px-4 font-sans">Details</th>
                      <th className="py-2.5 px-3 font-sans">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-cyber-800 text-[11px]">
                    {logs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-cyber-850/50 transition-colors">
                        <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                          {formatTimeAgo(l.created_at)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 dark:bg-cyber-800 text-slate-600 dark:text-slate-300">
                            {l.category || 'general'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-indigo-600 dark:text-cyan-400">
                          {l.action}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 max-w-md truncate">
                          {l.details || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                          {l.tg_id ? `User #${l.tg_id}` : 'System'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
