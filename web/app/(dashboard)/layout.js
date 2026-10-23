'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { isAuthenticated, getUser, clearToken } from '../../lib/auth';
import { useWebSocket } from '../../hooks/useWebSocket';
import { api } from '../../lib/api';
import { useTranslation, getSavedLanguage, applyLanguage } from '../../lib/i18n';
import {
  Squares2X2Icon,
  InboxIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  ServerStackIcon,
  CommandLineIcon,
  SignalIcon,
  CircleStackIcon,
  KeyIcon,
  LinkIcon,
  ComputerDesktopIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  FireIcon,
  LanguageIcon
} from '@heroicons/react/24/outline';

const NAV_ITEMS = [
  { href: '/', key: 'nav.overview', defaultLabel: 'Overview', icon: Squares2X2Icon, exact: true },
  { href: '/nodes', key: 'nav.nodes', defaultLabel: 'Nodes & Servers', icon: ServerStackIcon },
  { href: '/subdomains', key: 'nav.subdomains', defaultLabel: 'Domains & Subdomains', icon: GlobeAltIcon },
  { href: '/applications', key: 'nav.applications', defaultLabel: 'Applications', icon: CommandLineIcon },
  { href: '/monitoring', key: 'nav.monitoring', defaultLabel: 'Monitoring & Logs', icon: SignalIcon },
  { href: '/backups', key: 'nav.backups', defaultLabel: 'Backups & Recovery', icon: CircleStackIcon },
  { href: '/hosting', key: 'nav.hosting', defaultLabel: 'Edge Static Hosting', icon: ComputerDesktopIcon },
  { href: '/inbox', key: 'nav.inbox', defaultLabel: 'Inbox', icon: InboxIcon },
  { href: '/aliases', key: 'nav.aliases', defaultLabel: 'Email Aliases', icon: AtSymbolIcon },
  { href: '/api-keys', key: 'nav.api_keys', defaultLabel: 'API Keys & Tools', icon: KeyIcon },
  { href: '/sessions', key: 'nav.sessions', defaultLabel: 'Sessions & Auth', icon: ShieldCheckIcon },
  { href: '/settings', key: 'nav.settings', defaultLabel: 'Settings & Logs', icon: Cog6ToothIcon },
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const { t, lang, setLanguage, isRtl, meta, languages } = useTranslation();

  // Unread emails count
  const { data: unreadData, mutate: mutateUnread } = useSWR(
    'unread-count',
    () => apiFetchUnread(),
    { refreshInterval: 30000 }
  );

  async function apiFetchUnread() {
    try {
      const res = await fetch('/api/emails/unread-count', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('session_token') || ''}`
        }
      });
      if (res.ok) {
        const d = await res.json();
        return d.unread || 0;
      }
    } catch {}
    return 0;
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());

    // Initialize theme state
    const t = localStorage.getItem('theme') || 'system';
    const darkActive = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDark(darkActive);

    // Initialize language & RTL/LTR direction
    const savedLang = getSavedLanguage();
    applyLanguage(savedLang);
  }, [router]);

  function toggleTheme() {
    const nextTheme = isDark ? 'light' : 'dark';
    setIsDark(!isDark);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  const handleWs = useCallback((msg) => {
    if (msg.type === 'email.received') {
      mutateUnread();
      const em = msg.data?.email;
      toast.custom((t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full bg-white dark:bg-cyber-900 shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black/5 dark:ring-cyber-800 p-4 border border-indigo-100 dark:border-cyber-700`}
        >
          <div className="flex-1 w-0">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5 text-xl">📬</div>
              <div className="ml-3 rtl:ml-0 rtl:mr-3 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {em?.subject || 'New email received'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                  From: {em?.sender_name || em?.sender || 'Unknown'} → {em?.alias_address}
                </p>
                {em?.verification_code && (
                  <p className="mt-1.5 text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/80 px-2 py-0.5 rounded-md inline-block border border-cyan-200 dark:border-cyan-800">
                    OTP: {em.verification_code}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="ml-4 rtl:ml-0 rtl:mr-4 flex flex-col justify-center gap-1 border-l rtl:border-l-0 rtl:border-r border-slate-100 dark:border-cyber-800 pl-3 rtl:pl-0 rtl:pr-3">
            <button
              onClick={() => {
                toast.dismiss(t.id);
                if (em?.id) router.push(`/inbox/${em.id}`);
              }}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 py-1"
            >
              View
            </button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      ), { duration: 6000 });
    } else if (msg.type === 'email.read' || msg.type === 'email.deleted') {
      mutateUnread();
    }
  }, [mutateUnread, router]);

  const { connected } = useWebSocket(handleWs);

  async function handleQuickBurner() {
    setQuickCreating(true);
    try {
      const dd = await api.getDomains();
      const dom = dd?.domains?.[0];
      if (!dom) throw new Error('No domains available');
      const b = await api.createBurner(dom);
      toast.success(`1-Hour Burner created:\n${b.address}`, { duration: 4000 });
      router.push('/aliases');
    } catch (err) {
      toast.error(err.message || 'Failed to create burner');
    } finally {
      setQuickCreating(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {}
    clearToken();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-cyber-950 overflow-hidden font-sans">
      {/* Mobile Drawer Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 rtl:left-auto rtl:right-0 z-50 w-64 bg-white dark:bg-cyber-900 border-r rtl:border-r-0 rtl:border-l border-slate-200/90 dark:border-cyber-800 backdrop-blur-md transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:rtl:translate-x-0 lg:static flex flex-col ${
          open ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-cyber-800">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20">
            CD
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">Commandor Dev Pack</span>
            <span className="block text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">{t('overview.banner_tag', 'Cloud & Hosting Platform')}</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((i) => {
            const Icon = i.icon;
            const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
            const isInbox = i.href === '/inbox';
            const unreadCount = unreadData || 0;
            const label = t(i.key, i.defaultLabel);

            return (
              <Link
                key={i.href}
                href={i.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-50 dark:bg-cyber-850 text-indigo-700 dark:text-cyan-400 shadow-sm border border-indigo-100 dark:border-cyber-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-cyber-850/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${active ? 'text-indigo-600 dark:text-cyan-400' : 'text-slate-400'}`} />
                  <span>{label}</span>
                </div>
                {isInbox && unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 dark:bg-cyan-600 text-white shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}

          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all mt-4 border ${
                pathname.startsWith('/admin')
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60 shadow-sm'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 border-rose-200/50 dark:border-rose-900/30'
              }`}
              onClick={() => setOpen(false)}
            >
              <ShieldCheckIcon className="w-5 h-5 text-rose-500" />
              <span>{t('nav.admin', 'Admin Center')}</span>
            </Link>
          )}
        </nav>

        {/* Sidebar Bot Quick Help Card */}
        <div className="px-3 py-3 border-t border-slate-100 dark:border-cyber-800">
          <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800 text-xs">
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
              <span>🤖 {t('nav.bot_card_title', 'Telegram Bot')}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-2">{t('nav.bot_card_desc', 'Sync emails directly with your Telegram client.')}</p>
            <a
              href={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
            >
              {t('nav.bot_card_btn', 'Open Bot ↗')}
            </a>
          </div>
        </div>

        {/* User Card in Footer */}
        <div className="px-4 py-3.5 border-t border-slate-100 dark:border-cyber-800 flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 dark:bg-cyber-800 rounded-xl flex items-center justify-center text-indigo-700 dark:text-cyan-300 text-xs font-bold ring-1 ring-indigo-200 dark:ring-cyber-700">
            {user?.tgId ? String(user.tgId).slice(-2) : 'CD'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user?.username ? `@${user.username}` : `User #${user?.tgId}`}
            </div>
            <div className="text-[11px] text-slate-400 capitalize flex items-center gap-1">
              <span>{user?.role}</span>
              <span>•</span>
              <span className={connected ? 'text-emerald-500 font-medium' : 'text-slate-400'}>
                {connected ? t('common.online', 'Live') : t('common.offline', 'Offline')}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
            title={t('nav.logout', 'Sign out')}
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-cyber-900 border-b border-slate-200/80 dark:border-cyber-800 backdrop-blur-md flex-shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-cyber-850 transition-colors"
              aria-label="Open sidebar"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Commandor Dev Pack</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 capitalize">
                {pathname === '/' ? t('nav.overview', 'Overview') : (NAV_ITEMS.find(n => n.href === pathname) ? t(NAV_ITEMS.find(n => n.href === pathname).key, NAV_ITEMS.find(n => n.href === pathname).defaultLabel) : pathname.replace('/', ''))}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Sync Status Pill */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>{connected ? t('nav.live_sync', 'Realtime Connected') : t('nav.connecting', 'Connecting...')}</span>
            </div>

            {/* Quick 1-Hour Burner Button */}
            <button
              onClick={handleQuickBurner}
              disabled={quickCreating}
              className="btn bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 py-1.5 px-3 text-xs"
              title={t('nav.burner_quick', 'Instant 1-Hour Burner')}
            >
              <FireIcon className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">{quickCreating ? t('common.loading', 'Generating...') : t('nav.burner_quick', '1-Hour Burner')}</span>
            </button>

            {/* Quick Create Alias Button */}
            <Link
              href="/aliases"
              className="btn-primary py-1.5 px-3 text-xs shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{t('nav.new_alias', 'New Alias')}</span>
            </Link>

            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-cyber-850 transition-colors border border-slate-200 dark:border-cyber-800 flex items-center gap-1.5 text-xs font-medium"
                title={t('settings.language')}
              >
                <span className="text-sm">{meta.flag}</span>
                <span className="hidden sm:inline font-semibold">{meta.native}</span>
              </button>
              {showLangMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                  <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-48 bg-white dark:bg-cyber-900 rounded-xl shadow-xl border border-slate-200 dark:border-cyber-800 py-1.5 z-50 max-h-80 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-cyber-800">
                      {t('settings.language')}
                    </div>
                    {languages.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => {
                          setLanguage(l.id);
                          setShowLangMenu(false);
                          api.updateProfile({ language: l.id }).catch(() => {});
                          toast.success(`${l.flag} ${l.native}`);
                        }}
                        className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left rtl:text-right hover:bg-slate-50 dark:hover:bg-cyber-850 transition-colors ${
                          lang === l.id
                            ? 'font-bold text-indigo-600 dark:text-cyan-400 bg-indigo-50/50 dark:bg-cyber-800/50'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{l.flag}</span>
                          <span>{l.native}</span>
                        </span>
                        {lang === l.id && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-cyber-850 transition-colors border border-slate-200 dark:border-cyber-800"
              title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
            >
              {isDark ? (
                <SunIcon className="w-4 h-4 text-amber-400" />
              ) : (
                <MoonIcon className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
