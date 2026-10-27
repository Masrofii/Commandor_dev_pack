'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { isAuthenticated, getUser, clearToken } from '../../lib/auth';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useTheme } from '../../hooks/useTheme';
import { api } from '../../lib/api';
import { useTranslation, getSavedLanguage, applyLanguage } from '../../lib/i18n';
import { formatTimeAgo } from '../../lib/helpers';
import BrandMark from '../../components/BrandMark';
import CommandPalette from '../../components/CommandPalette';
import LanguageBadge from '../../components/LanguageBadge';
import {
  HomeIcon,
  InboxIcon,
  AtSymbolIcon,
  GlobeAmericasIcon,
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
  ComputerDesktopIcon as SystemThemeIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  FireIcon,
  LanguageIcon,
  MagnifyingGlassIcon,
  BellIcon,
  BookOpenIcon,
  LifebuoyIcon,
  ChevronDownIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ArrowTopRightOnSquareIcon,
  RocketLaunchIcon,
  GlobeAltIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const NAV_GROUPS = [
  {
    id: 'account',
    labelKey: 'nav.group_account',
    label: 'Account',
    items: [
      {
        href: '/',
        key: 'nav.overview',
        label: 'Overview',
        description: 'Account home, activity and service health',
        icon: HomeIcon,
        exact: true
      },
      {
        href: '/inbox',
        key: 'nav.inbox',
        label: 'Inbox',
        description: 'Read incoming mail and verification codes',
        icon: InboxIcon,
        unread: true
      }
    ]
  },
  {
    id: 'build',
    labelKey: 'nav.group_build',
    label: 'Build',
    items: [
      {
        href: '/applications',
        key: 'nav.applications',
        label: 'Applications',
        description: 'Deploy and operate Node applications',
        icon: CommandLineIcon
      },
      {
        href: '/hosting',
        key: 'nav.hosting',
        label: 'Edge hosting',
        description: 'Publish fast static sites and landing pages',
        icon: ComputerDesktopIcon
      }
    ]
  },
  {
    id: 'network',
    labelKey: 'nav.group_network',
    label: 'Network',
    items: [
      {
        href: '/subdomains',
        key: 'nav.subdomains',
        label: 'Domains & routing',
        description: 'Manage DNS, subdomains, proxies and TLS',
        icon: GlobeAmericasIcon
      },
      {
        href: '/webhooks',
        key: 'nav.webhooks',
        label: 'Webhooks',
        description: 'Deliver signed events to external services',
        icon: BoltIcon
      }
    ]
  },
  {
    id: 'email',
    labelKey: 'nav.group_email',
    label: 'Email',
    items: [
      {
        href: '/aliases',
        key: 'nav.aliases',
        label: 'Email aliases',
        description: 'Create private and disposable addresses',
        icon: AtSymbolIcon
      }
    ]
  },
  {
    id: 'operations',
    labelKey: 'nav.group_operations',
    label: 'Operations',
    items: [
      {
        href: '/nodes',
        key: 'nav.nodes',
        label: 'Nodes & servers',
        description: 'Inspect the VPS fleet and connection health',
        icon: ServerStackIcon,
        adminOnly: true
      },
      {
        href: '/monitoring',
        key: 'nav.monitoring',
        label: 'Monitoring',
        description: 'Host telemetry, events and capacity trends',
        icon: SignalIcon,
        adminOnly: true
      },
      {
        href: '/backups',
        key: 'nav.backups',
        label: 'Backups',
        description: 'Create, verify and restore recovery points',
        icon: CircleStackIcon,
        adminOnly: true
      }
    ]
  },
  {
    id: 'access',
    labelKey: 'nav.group_access',
    label: 'Access',
    items: [
      {
        href: '/api-keys',
        key: 'nav.api_keys',
        label: 'API keys',
        description: 'Issue scoped tokens for automation',
        icon: KeyIcon
      },
      {
        href: '/sessions',
        key: 'nav.sessions',
        label: 'Sessions',
        description: 'Review and revoke signed-in devices',
        icon: ShieldCheckIcon
      }
    ]
  },
  {
    id: 'workspace',
    labelKey: 'nav.group_workspace',
    label: 'Workspace',
    items: [
      {
        href: '/settings',
        key: 'nav.settings',
        label: 'Settings',
        description: 'Appearance, language, security and audit trail',
        icon: Cog6ToothIcon
      }
    ]
  }
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const ADMIN_NAV_ITEM = {
  href: '/admin',
  key: 'nav.admin',
  label: 'Admin panel',
  description: 'Platform administration and system controls',
  icon: ShieldCheckIcon
};

function matchesPath(item, pathname) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function findActiveNav(pathname) {
  if (pathname === ADMIN_NAV_ITEM.href || pathname.startsWith(`${ADMIN_NAV_ITEM.href}/`)) return ADMIN_NAV_ITEM;
  return [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => matchesPath(item, pathname));
}

function initialsFor(user) {
  const base = user?.username || user?.first_name || user?.name || (user?.tgId ? String(user.tgId) : 'CD');
  return base.replace(/^@/, '').slice(0, 2).toUpperCase();
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, lang, setLanguage, meta, languages } = useTranslation();
  const { mode: themeMode, isDark, toggle: toggleTheme, setMode: setThemeMode } = useTheme();

  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [botUsername, setBotUsername] = useState(process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot');
  const [recentHrefs, setRecentHrefs] = useState([]);

  const { data: unreadData, mutate: mutateUnread } = useSWR('unread-count', apiFetchUnread, {
    refreshInterval: 30000,
    revalidateOnFocus: true
  });

  const { data: notificationEmails } = useSWR(
    menu === 'notifications' ? 'notification-emails' : null,
    () => api.getEmails({ limit: 5 }),
    { revalidateOnFocus: true }
  );

  async function apiFetchUnread() {
    try {
      const res = await fetch('/api/emails/unread-count', {
        headers: { Authorization: `Bearer ${localStorage.getItem('session_token') || ''}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.unread || 0;
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

    const savedLang = getSavedLanguage();
    applyLanguage(savedLang);

    try {
      setCollapsed(localStorage.getItem('sidebar_collapsed') === '1');
      const savedRecent = JSON.parse(localStorage.getItem('commandor_recent_pages') || '[]');
      if (Array.isArray(savedRecent)) setRecentHrefs(savedRecent.filter((href) => typeof href === 'string').slice(0, 4));
    } catch {}

    api
      .getAuthConfig()
      .then((cfg) => {
        setTelegramEnabled(Boolean(cfg?.telegramEnabled));
        if (cfg?.botUsername) setBotUsername(cfg.botUsername);
      })
      .catch(() => setTelegramEnabled(false));
  }, [router]);

  const activeNav = findActiveNav(pathname);
  const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => item === activeNav)) || (activeNav === ADMIN_NAV_ITEM ? { id: 'admin', labelKey: 'admin.eyebrow', label: 'Administration' } : undefined);

  useEffect(() => {
    if (!activeNav || !user) return;
    setRecentHrefs((previous) => {
      const next = [activeNav.href, ...previous.filter((href) => href !== activeNav.href)].slice(0, 4);
      try {
        localStorage.setItem('commandor_recent_pages', JSON.stringify(next));
      } catch {}
      return next;
    });
    document.title = `${t(activeNav.key, activeNav.label)} · Commandor Dev Pack`;
  }, [activeNav, user, t]);

  useEffect(() => {
    setMobileOpen(false);
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      } else if (event.key === 'Escape') {
        setMenu(null);
        setMobileOpen(false);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    const openCommand = () => setCommandOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('app:open-command', openCommand);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('app:open-command', openCommand);
    };
  }, []);

  const handleWs = useCallback(
    (msg) => {
      if (msg.type === 'email.received') {
        mutateUnread();
        const email = msg.data?.email;
        toast.custom(
          (toastItem) => (
            <div
              className={`${
                toastItem.visible ? 'animate-enter' : 'animate-leave'
              } pointer-events-auto flex w-full max-w-md overflow-hidden rounded-xl border border-cf-200 bg-white p-4 shadow-popover dark:border-cyber-800 dark:bg-cyber-900`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
                  <InboxIcon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-cf-ink dark:text-white">
                    {email?.subject || 'New email received'}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-cf-500 dark:text-slate-400">
                    {email?.sender_name || email?.sender || 'Unknown sender'} → {email?.alias_address || 'your alias'}
                  </p>
                  {email?.verification_code && (
                    <p className="mt-1.5 inline-flex rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
                      Code {email.verification_code}
                    </p>
                  )}
                </div>
              </div>
              <div className="ml-4 flex flex-col justify-center gap-1 border-l border-cf-200 pl-3 dark:border-cyber-800">
                <button
                  type="button"
                  onClick={() => {
                    toast.dismiss(toastItem.id);
                    if (email?.id) router.push(`/inbox/${email.id}`);
                  }}
                  className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => toast.dismiss(toastItem.id)}
                  className="text-[11px] text-cf-400 hover:text-cf-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  Close
                </button>
              </div>
            </div>
          ),
          { duration: 6000 }
        );
      } else if (msg.type === 'email.read' || msg.type === 'email.deleted') {
        mutateUnread();
      }
    },
    [mutateUnread, router]
  );

  const { connected } = useWebSocket(handleWs);

  async function handleQuickBurner() {
    setQuickCreating(true);
    setMenu(null);
    try {
      const domainData = await api.getDomains();
      const domain = domainData?.domains?.[0];
      if (!domain) throw new Error('No email domain is configured yet.');
      const burner = await api.createBurner(domain);
      toast.success(`1-hour burner ready\n${burner.address}`, { duration: 5000 });
      router.push('/aliases');
    } catch (error) {
      toast.error(error.message || 'Failed to create burner');
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

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }

  const unreadCount = unreadData || 0;
  const displayName = user?.username ? `@${user.username}` : user?.first_name || user?.name || `User #${user?.tgId || ''}`;
  const avatar = initialsFor(user);

  const commandItems = useMemo(
    () =>
      NAV_GROUPS.flatMap((group) =>
        group.items
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => ({
            href: item.href,
            label: t(item.key, item.label),
            description: item.description,
            group: t(group.labelKey, group.label),
            icon: item.icon,
            badge: item.unread && unreadCount ? String(unreadCount) : null,
            keywords: `${item.label} ${item.href} ${group.label}`
          }))
      ),
    [t, unreadCount, user?.role]
  );

  const commandActions = useMemo(
    () => [
      {
        label: 'Create a new alias',
        description: 'Generate a private address on one of your domains',
        group: 'Quick actions',
        icon: AtSymbolIcon,
        onSelect: () => router.push('/aliases')
      },
      {
        label: 'Create a 1-hour burner',
        description: 'Temporary disposable inbox with automatic expiry',
        group: 'Quick actions',
        icon: FireIcon,
        onSelect: handleQuickBurner
      },
      {
        label: 'Deploy an application',
        description: 'Ship a Node app with build, logs and health checks',
        group: 'Quick actions',
        icon: RocketLaunchIcon,
        onSelect: () => router.push('/applications')
      },
      {
        label: 'Publish an edge site',
        description: 'Serve a static page from your own domain',
        group: 'Quick actions',
        icon: GlobeAltIcon,
        onSelect: () => router.push('/hosting')
      },
      {
        label: 'Add a domain route',
        description: 'Point a subdomain at a service and issue TLS',
        group: 'Quick actions',
        icon: ArrowsRightLeftIcon,
        onSelect: () => router.push('/subdomains')
      },
      {
        label: themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        description: `Appearance · currently ${themeMode}`,
        group: 'Preferences',
        icon: themeMode === 'dark' ? SunIcon : MoonIcon,
        onSelect: () => setThemeMode(isDark ? 'light' : 'dark')
      },
      {
        label: 'Use system appearance',
        description: 'Follow your operating system theme automatically',
        group: 'Preferences',
        icon: SystemThemeIcon,
        onSelect: () => setThemeMode('system')
      }
    ],
    [isDark, router, setThemeMode, themeMode]
  );

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cf-bg dark:bg-cyber-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size={44} />
          <div className="text-sm font-semibold text-cf-700 dark:text-slate-200">Loading your workspace…</div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-cf-200 dark:bg-cyber-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" />
          </div>
        </div>
      </div>
    );
  }

  const recentItems = recentHrefs
    .map((href) => [...ALL_NAV_ITEMS, ADMIN_NAV_ITEM].find((item) => item.href === href))
    .filter((item) => item && (!item.adminOnly || user?.role === 'admin'));

  return (
    <div className="flex h-screen overflow-hidden bg-cf-bg font-sans dark:bg-cyber-950">
      <a
        href="#main-content"
        className="sr-only z-[200] rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-slate-950/60 dark:bg-black/75 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-[268px] flex-col border-e border-cf-200 bg-white dark:bg-cyber-900 shadow-2xl lg:shadow-none transition-[width,transform] duration-200 ease-out dark:border-cyber-800 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full'
        } ${collapsed ? 'lg:w-[72px]' : 'lg:w-[248px]'}`}
        aria-label="Primary navigation"
      >
        <div className={`flex h-[60px] flex-shrink-0 items-center border-b border-cf-200 dark:border-cyber-800 ${collapsed ? 'px-3 lg:justify-center' : 'px-4'}`}>
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Commandor Dev Pack home">
            <BrandMark size={32} withRing />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate font-display text-[14px] font-bold leading-4 tracking-tight text-cf-ink dark:text-white">
                  Commandor
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-cf-400 dark:text-slate-500">
                  Cloud account
                </span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <span className="ml-auto hidden rounded-md border border-cf-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cf-500 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-400 lg:inline-flex">
              v1.0
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="icon-btn ms-auto lg:hidden"
            aria-label="Close navigation"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className={`px-2.5 pt-3 ${collapsed ? 'lg:px-3' : ''}`}>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className={`flex h-9 w-full items-center gap-2 rounded-lg border border-cf-200 bg-white px-2.5 text-left text-[12px] font-medium text-cf-400 shadow-xs transition-colors hover:border-cf-300 hover:text-cf-600 dark:border-cyber-800 dark:bg-cyber-950/40 dark:text-slate-500 dark:hover:border-cyber-700 dark:hover:text-slate-300 ${
              collapsed ? 'lg:justify-center lg:px-0' : ''
            }`}
            aria-label="Open quick search"
          >
            <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="min-w-0 flex-1 truncate">Quick search…</span>}
            {!collapsed && <span className="kbd">⌘K</span>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-3">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !item.adminOnly || user?.role === 'admin');
            if (!visibleItems.length) return null;
            const isFirst = group.id === 'account';
            return (
              <div key={group.id} className={isFirst ? '' : 'mt-4'}>
                {!collapsed ? (
                  <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-cf-400 dark:text-slate-500">
                    {t(group.labelKey, group.label)}
                  </div>
                ) : (
                  <div className="mx-2 mb-2 border-t border-cf-200 dark:border-cyber-800" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = matchesPath(item, pathname);
                    const Icon = item.icon;
                    const label = t(item.key, item.label);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex min-h-[36px] items-center rounded-lg text-[13px] transition-colors ${
                          collapsed ? 'lg:justify-center lg:px-0' : 'gap-2.5 px-2.5'
                        } ${
                          active
                            ? 'bg-cf-100 font-semibold text-cf-ink dark:bg-cyber-850 dark:text-white'
                            : 'font-medium text-cf-600 hover:bg-cf-100/70 hover:text-cf-ink dark:text-slate-400 dark:hover:bg-cyber-850/60 dark:hover:text-slate-100'
                        }`}
                        onClick={() => setMobileOpen(false)}
                      >
                        {active && (
                          <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand-500" aria-hidden="true" />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] flex-shrink-0 ${
                            active ? 'text-brand-600 dark:text-brand-400' : 'text-cf-400 group-hover:text-cf-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                          }`}
                        />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                        {!collapsed && item.unread && unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-700 px-1.5 text-[10px] font-bold text-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {recentItems.length > 0 && (
            <div className="mt-4">
              {!collapsed ? (
                <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-cf-400 dark:text-slate-500">
                  Recent
                </div>
              ) : (
                <div className="mx-2 mb-2 border-t border-cf-200 dark:border-cyber-800" />
              )}
              <div className="space-y-0.5">
                {recentItems.map((item) => {
                  const Icon = item.icon;
                  const active = matchesPath(item, pathname);
                  return (
                    <Link
                      key={`recent-${item.href}`}
                      href={item.href}
                      title={collapsed ? t(item.key, item.label) : undefined}
                      className={`group flex min-h-[32px] items-center rounded-lg text-[12px] transition-colors ${
                        collapsed ? 'lg:justify-center lg:px-0' : 'gap-2.5 px-2.5'
                      } ${
                        active
                          ? 'bg-cf-100 font-semibold text-cf-ink dark:bg-cyber-850 dark:text-white'
                          : 'font-medium text-cf-500 hover:bg-cf-100/70 hover:text-cf-ink dark:text-slate-500 dark:hover:bg-cyber-850/60 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-cf-400 dark:text-slate-500" />
                      {!collapsed && <span className="truncate">{t(item.key, item.label)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="mt-4 border-t border-cf-200 pt-3 dark:border-cyber-800">
              <Link
                href="/admin"
                title={collapsed ? t('nav.admin', 'Admin center') : undefined}
                className={`group flex min-h-[36px] items-center rounded-lg text-[13px] font-semibold transition-colors ${
                  collapsed ? 'lg:justify-center lg:px-0' : 'gap-2.5 px-2.5'
                } ${
                  pathname.startsWith('/admin')
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30'
                }`}
              >
                <ShieldCheckIcon className="h-[18px] w-[18px] flex-shrink-0 text-brand-500" />
                {!collapsed && <span className="truncate">{t('nav.admin', 'Admin center')}</span>}
                {!collapsed && (
                  <span className="ms-auto rounded border border-brand-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-600 dark:border-brand-900 dark:text-brand-400">
                    Admin
                  </span>
                )}
              </Link>
            </div>
          )}
        </nav>

        <div className="flex-shrink-0 border-t border-cf-200 px-2.5 py-2.5 dark:border-cyber-800">
          {!collapsed ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px] text-cf-500 shadow-xs ring-1 ring-cf-200 dark:bg-cyber-950/40 dark:text-slate-400 dark:ring-cyber-800">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="min-w-0 flex-1 truncate">
                {connected ? t('nav.live_sync', 'Realtime connected') : t('nav.connecting', 'Reconnecting…')}
              </span>
              <Link href="/settings" className="font-semibold text-cf-400 hover:text-cf-700 dark:hover:text-slate-200">
                {t('nav.settings', 'Settings')}
              </Link>
            </div>
          ) : (
            <div className="mb-2 flex justify-center" title={connected ? 'Realtime connected' : 'Reconnecting'}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </div>
          )}

          <div className={`flex items-center rounded-lg ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cf-200 bg-cf-100 text-[11px] font-bold text-cf-700 dark:border-cyber-700 dark:bg-cyber-850 dark:text-slate-200"
              title={displayName}
            >
              {avatar}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-cf-ink dark:text-slate-100">{displayName}</div>
                  <div className="flex items-center gap-1 text-[10px] capitalize text-cf-400 dark:text-slate-500">
                    <span>{user.role || 'user'}</span>
                    <span>·</span>
                    <span className={connected ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                      {connected ? 'online' : 'offline'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="icon-btn h-8 w-8"
                  title={t('nav.logout', 'Sign out')}
                  aria-label={t('nav.logout', 'Sign out')}
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4 rtl:rotate-180" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-40 flex h-[60px] flex-shrink-0 items-center gap-2 border-b border-cf-200 bg-white/95 px-3 backdrop-blur dark:border-cyber-800 dark:bg-cyber-900/95 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="icon-btn lg:hidden"
            aria-label="Open navigation"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="icon-btn hidden lg:inline-flex"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronDoubleRightIcon className="h-4 w-4 rtl:rotate-180" /> : <ChevronDoubleLeftIcon className="h-4 w-4 rtl:rotate-180" />}
          </button>

          <nav className="hidden min-w-0 items-center gap-2 text-[12px] sm:flex" aria-label="Breadcrumb">
            <Link href="/" className="font-medium text-cf-500 transition-colors hover:text-cf-ink dark:text-slate-400 dark:hover:text-white">
              Account home
            </Link>
            <span className="text-cf-300 dark:text-slate-600">/</span>
            {activeGroup && activeGroup.id !== 'account' && (
              <>
                <span className="hidden truncate text-cf-400 dark:text-slate-500 md:inline">
                  {t(activeGroup.labelKey, activeGroup.label)}
                </span>
                <span className="hidden text-cf-300 dark:text-slate-600 md:inline">/</span>
              </>
            )}
            <span className="truncate font-semibold text-cf-ink dark:text-slate-100">
              {activeNav ? t(activeNav.key, activeNav.label) : 'Workspace'}
            </span>
          </nav>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="ms-auto hidden h-9 w-[min(28vw,280px)] items-center gap-2 rounded-lg border border-cf-200 bg-cf-50 px-2.5 text-left text-[12px] text-cf-400 transition-colors hover:border-cf-300 hover:bg-white hover:text-cf-600 dark:border-cyber-800 dark:bg-cyber-950/40 dark:text-slate-500 dark:hover:border-cyber-700 dark:hover:text-slate-300 md:flex"
            aria-label="Search the dashboard"
          >
            <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search anything…</span>
            <span className="kbd">⌘K</span>
          </button>

          <div className="ms-auto flex items-center gap-1.5 md:ms-0">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="icon-btn md:hidden"
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-4.5 w-4.5" />
            </button>

            <div
              className={`hidden h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold xl:flex ${
                connected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400'
              }`}
              title={connected ? 'WebSocket connected' : 'Reconnecting to realtime updates'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {connected ? 'Live' : 'Offline'}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === 'create' ? null : 'create')}
                className="btn-primary h-9 px-3"
                aria-haspopup="menu"
                aria-expanded={menu === 'create'}
              >
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Create</span>
                <ChevronDownIcon className="hidden h-3 w-3 opacity-70 sm:block" />
              </button>
              {menu === 'create' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="menu-panel end-0 w-64" role="menu">
                    <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cf-400 dark:text-slate-500">
                      Create new
                    </div>
                    {[
                      { href: '/aliases', label: 'Email alias', description: 'Private forwarding address', icon: AtSymbolIcon },
                      { href: '/subdomains', label: 'Domain route', description: 'DNS, proxy and TLS', icon: ArrowsRightLeftIcon },
                      { href: '/applications', label: 'Application', description: 'Deploy from Git', icon: CommandLineIcon },
                      { href: '/hosting', label: 'Edge site', description: 'Publish static pages', icon: GlobeAltIcon }
                    ].map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link key={action.href} href={action.href} className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-cf-200 bg-cf-50 text-cf-500 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-400">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{action.label}</span>
                            <span className="block truncate text-[10px] font-normal text-cf-400 dark:text-slate-500">{action.description}</span>
                          </span>
                        </Link>
                      );
                    })}
                    <div className="my-1 border-t border-cf-100 dark:border-cyber-800" />
                    <button type="button" onClick={handleQuickBurner} disabled={quickCreating} className="menu-item w-full" role="menuitem">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
                        <FireIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{quickCreating ? 'Creating burner…' : '1-hour burner'}</span>
                        <span className="block truncate text-[10px] font-normal text-cf-400 dark:text-slate-500">Temporary disposable inbox</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setMenu(menu === 'help' ? null : 'help')}
                className="icon-btn"
                title="Help & support"
                aria-label="Help and support"
                aria-haspopup="menu"
                aria-expanded={menu === 'help'}
              >
                <LifebuoyIcon className="h-4.5 w-4.5" />
              </button>
              {menu === 'help' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="menu-panel end-0 w-60" role="menu">
                    <a
                      href="https://github.com/Masrofii/Commandor_dev_pack#readme"
                      target="_blank"
                      rel="noreferrer"
                      className="menu-item"
                      role="menuitem"
                    >
                      <BookOpenIcon className="h-4 w-4" />
                      <span className="flex-1">Documentation</span>
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-cf-400" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        setCommandOpen(true);
                      }}
                      className="menu-item w-full"
                      role="menuitem"
                    >
                      <MagnifyingGlassIcon className="h-4 w-4" />
                      <span className="flex-1">Quick search</span>
                      <span className="kbd">⌘K</span>
                    </button>
                    {telegramEnabled && (
                      <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="menu-item" role="menuitem">
                        <SparklesIcon className="h-4 w-4" />
                        <span className="flex-1">Telegram bot</span>
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-cf-400" />
                      </a>
                    )}
                    {user?.role === 'admin' && (
                      <Link href="/monitoring" className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                        <SignalIcon className="h-4 w-4" />
                        <span className="flex-1">System status</span>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="icon-btn"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
            </button>

            <div className="relative hidden xl:block">
              <button
                type="button"
                onClick={() => setMenu(menu === 'language' ? null : 'language')}
                className="icon-btn w-auto gap-1 px-2"
                title={t('settings.language')}
                aria-haspopup="menu"
                aria-expanded={menu === 'language'}
              >
                <LanguageBadge id={lang} className="h-4 min-w-[20px] text-[8px]" />
                <span className="hidden text-[11px] font-semibold 2xl:inline">{meta.native}</span>
                <ChevronDownIcon className="h-3 w-3 opacity-60" />
              </button>
              {menu === 'language' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="menu-panel end-0 max-h-80 w-52 overflow-y-auto" role="menu">
                    <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cf-400 dark:text-slate-500">
                      {t('settings.language')}
                    </div>
                    {languages.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        onClick={() => {
                          setLanguage(language.id);
                          setMenu(null);
                          api.updateProfile({ language: language.id }).catch(() => {});
                          toast.success(`${language.native}`);
                        }}
                        className={`menu-item w-full ${lang === language.id ? 'bg-cf-100 dark:bg-cyber-850' : ''}`}
                        role="menuitem"
                      >
                        <LanguageBadge id={language.id} />
                        <span className="flex-1">{language.native}</span>
                        {lang === language.id && <span className="text-brand-600 dark:text-brand-400">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === 'notifications' ? null : 'notifications')}
                className="icon-btn relative"
                title="Notifications"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-haspopup="menu"
                aria-expanded={menu === 'notifications'}
              >
                <BellIcon className="h-4.5 w-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-cyber-900">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {menu === 'notifications' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="menu-panel end-0 w-[min(92vw,360px)] p-0" role="menu">
                    <div className="flex items-center justify-between border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
                      <div>
                        <div className="text-[13px] font-semibold text-cf-ink dark:text-white">Notifications</div>
                        <div className="mt-0.5 text-[10px] text-cf-400 dark:text-slate-500">
                          {unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
                        </div>
                      </div>
                      <Link
                        href="/inbox"
                        onClick={() => setMenu(null)}
                        className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
                      >
                        Open inbox
                      </Link>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {!notificationEmails ? (
                        <div className="space-y-2 p-2">
                          {[0, 1, 2].map((index) => (
                            <div key={index} className="flex gap-2.5">
                              <div className="skeleton h-8 w-8" />
                              <div className="flex-1 space-y-1.5 py-1">
                                <div className="skeleton h-2.5 w-2/3" />
                                <div className="skeleton h-2 w-1/2" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (notificationEmails.emails || []).length === 0 ? (
                        <div className="empty-state py-8">
                          <div className="empty-state-icon">
                            <InboxIcon className="h-5 w-5" />
                          </div>
                          <p className="text-xs text-cf-500 dark:text-slate-400">No messages yet.</p>
                        </div>
                      ) : (
                        (notificationEmails.emails || []).map((email) => (
                          <Link
                            key={email.id}
                            href={`/inbox/${email.id}`}
                            className="flex gap-2.5 rounded-lg p-2.5 transition-colors hover:bg-cf-100 dark:hover:bg-cyber-850"
                            role="menuitem"
                            onClick={() => setMenu(null)}
                          >
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cf-200 bg-cf-50 text-[10px] font-bold text-cf-600 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-300">
                              {(email.sender_name || email.sender || '?').slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-cf-ink dark:text-slate-100">
                                  {email.subject || '(no subject)'}
                                </span>
                                {!email.is_read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cf-400 dark:text-slate-500">
                                <span className="truncate">{email.sender_name || email.sender}</span>
                                <span>·</span>
                                <span className="flex-shrink-0">{formatTimeAgo(email.received_at)}</span>
                              </span>
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === 'user' ? null : 'user')}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-transparent px-1 transition-colors hover:border-cf-200 hover:bg-cf-50 dark:hover:border-cyber-800 dark:hover:bg-cyber-850"
                aria-haspopup="menu"
                aria-expanded={menu === 'user'}
                aria-label="Account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-cf-200 bg-cf-100 text-[10px] font-bold text-cf-700 dark:border-cyber-700 dark:bg-cyber-850 dark:text-slate-200">
                  {avatar}
                </span>
                <ChevronDownIcon className="hidden h-3 w-3 text-cf-400 sm:block" />
              </button>
              {menu === 'user' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="menu-panel end-0 w-64" role="menu">
                    <div className="px-2.5 pb-2 pt-1.5">
                      <div className="truncate text-[13px] font-semibold text-cf-ink dark:text-white">{displayName}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] capitalize text-cf-400 dark:text-slate-500">
                        <span>{user.role || 'user'}</span>
                        <span>·</span>
                        <span>{connected ? 'realtime connected' : 'realtime offline'}</span>
                      </div>
                    </div>
                    <div className="my-1 border-t border-cf-100 dark:border-cyber-800" />
                    <Link href="/settings" className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                      <Cog6ToothIcon className="h-4 w-4" />
                      <span className="flex-1">Account settings</span>
                    </Link>
                    <Link href="/sessions" className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                      <ShieldCheckIcon className="h-4 w-4" />
                      <span className="flex-1">Active sessions</span>
                    </Link>
                    {user.role === 'admin' && (
                      <Link href="/admin" className="menu-item" role="menuitem" onClick={() => setMenu(null)}>
                        <KeyIcon className="h-4 w-4" />
                        <span className="flex-1">Admin center</span>
                      </Link>
                    )}
                    <div className="my-1 border-t border-cf-100 dark:border-cyber-800" />
                    <div className="flex items-center gap-1 px-1 pb-1">
                      {[
                        { id: 'light', label: 'Light', icon: SunIcon },
                        { id: 'dark', label: 'Dark', icon: MoonIcon },
                        { id: 'system', label: 'System', icon: SystemThemeIcon }
                      ].map((themeOption) => {
                        const Icon = themeOption.icon;
                        return (
                          <button
                            key={themeOption.id}
                            type="button"
                            onClick={() => setThemeMode(themeOption.id)}
                            className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[9px] font-semibold transition-colors ${
                              themeMode === themeOption.id
                                ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-300'
                                : 'border-transparent text-cf-500 hover:bg-cf-100 dark:text-slate-400 dark:hover:bg-cyber-850'
                            }`}
                            title={`${themeOption.label} appearance`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {themeOption.label}
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={logout} className="menu-item w-full text-rose-600 dark:text-rose-400" role="menuitem">
                      <ArrowRightOnRectangleIcon className="h-4 w-4 rtl:rotate-180" />
                      <span className="flex-1">{t('nav.logout', 'Sign out')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto bg-cf-bg dark:bg-cyber-950">
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        items={commandItems}
        actions={commandActions}
        placeholder="Search pages, actions, settings…"
      />
    </div>
  );
}
