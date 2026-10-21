'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { isAuthenticated, getUser, clearToken } from '../../lib/auth';
import { useWebSocket } from '../../hooks/useWebSocket';
import { api } from '../../lib/api';
import {
  InboxIcon,
  AtSymbolIcon,
  LinkIcon,
  KeyIcon,
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
  ArrowPathIcon,
  GlobeAltIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';

const NAV = [
  { href: '/inbox', label: 'Inbox', icon: InboxIcon },
  { href: '/aliases', label: 'Aliases', icon: AtSymbolIcon },
  { href: '/subdomains', label: 'Subdomains', icon: GlobeAltIcon },
  { href: '/hosting', label: 'Hosting & Nodes', icon: ServerStackIcon },
  { href: '/webhooks', label: 'Webhooks', icon: LinkIcon },
  { href: '/api-keys', label: 'API Keys', icon: KeyIcon },
  { href: '/sessions', label: 'Sessions', icon: ComputerDesktopIcon },
  { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);

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
          } max-w-md w-full bg-white dark:bg-slate-800 shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black/5 dark:ring-white/10 p-4 border border-indigo-100 dark:border-indigo-900/50`}
        >
          <div className="flex-1 w-0">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5 text-xl">📬</div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {em?.subject || 'New email received'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                  From: {em?.sender_name || em?.sender || 'Unknown'} → {em?.alias_address}
                </p>
                {em?.verification_code && (
                  <p className="mt-1.5 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md inline-block">
                    Code: {em.verification_code}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="ml-4 flex flex-col justify-center gap-1 border-l border-slate-100 dark:border-slate-700 pl-3">
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
      toast.success(`Burner alias created:\n${b.address}`, { duration: 4000 });
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
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans">
      {/* Mobile Drawer Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800/95 border-r border-slate-200/80 dark:border-slate-700/70 backdrop-blur-md transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20">
            TM
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">TempMail</span>
            <span className="block text-[11px] text-slate-400 font-medium">Disposable Email Suite</span>
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
          {NAV.map((i) => {
            const Icon = i.icon;
            const active = pathname.startsWith(i.href);
            const isInbox = i.href === '/inbox';
            const unreadCount = unreadData || 0;

            return (
              <Link
                key={i.href}
                href={i.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                  <span>{i.label}</span>
                </div>
                {isInbox && unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}

          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all mt-4 border border-rose-200/50 dark:border-rose-900/40"
              onClick={() => setOpen(false)}
            >
              <ShieldCheckIcon className="w-5 h-5 text-rose-500" />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        {/* Sidebar Bot Quick Help Card */}
        <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-700/60">
          <div className="p-3 bg-gradient-to-br from-indigo-50/60 to-slate-100/60 dark:from-indigo-950/20 dark:to-slate-800/60 rounded-xl border border-indigo-100/70 dark:border-indigo-900/30 text-xs">
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
              <span>🤖 Telegram Bot</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-2">Sync emails directly with your Telegram client.</p>
            <a
              href="https://t.me/commandor_mail_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              Open Bot ↗
            </a>
          </div>
        </div>

        {/* User Card in Footer */}
        <div className="px-4 py-3.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold ring-1 ring-indigo-200 dark:ring-indigo-800">
            {user?.tgId ? String(user.tgId).slice(-2) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user?.username ? `@${user.username}` : `User #${user?.tgId}`}
            </div>
            <div className="text-[11px] text-slate-400 capitalize flex items-center gap-1">
              <span>{user?.role}</span>
              <span>•</span>
              <span className={connected ? 'text-emerald-500 font-medium' : 'text-slate-400'}>
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
            title="Sign out"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700/70 backdrop-blur-md flex-shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              aria-label="Open sidebar"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">TempMail</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 capitalize">
                {pathname.replace('/', '') || 'Dashboard'}
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
              <span>{connected ? 'Live Sync' : 'Reconnecting'}</span>
            </div>

            {/* Quick 1-Hour Burner Button */}
            <button
              onClick={handleQuickBurner}
              disabled={quickCreating}
              className="btn bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 py-1.5 px-3 text-xs"
              title="Instant 1-Hour Burner"
            >
              <FireIcon className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">{quickCreating ? 'Creating...' : 'Quick Burner'}</span>
            </button>

            {/* Quick Create Alias Button */}
            <Link
              href="/aliases"
              className="btn-primary py-1.5 px-3 text-xs shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New Alias</span>
            </Link>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors border border-slate-200 dark:border-slate-700"
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
