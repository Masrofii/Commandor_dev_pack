'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { getUser, isAdmin } from '../../lib/auth';
import { extractVerificationCode, formatTimeAgo } from '../../lib/helpers';
import { useTranslation } from '../../lib/i18n';
import InfrastructureTopologyMap from '../../components/InfrastructureTopologyMap';
import {
  InboxIcon,
  AtSymbolIcon,
  GlobeAmericasIcon,
  ServerStackIcon,
  PlusIcon,
  FireIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CommandLineIcon,
  SparklesIcon,
  CircleStackIcon,
  SignalIcon,
  MagnifyingGlassIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  GlobeAltIcon,
  RocketLaunchIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentTextIcon,
  KeyIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const PERIODS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' }
];

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSeries(records, field, days) {
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    buckets.push({ key: dayKey(date), label: date, value: 0 });
  }
  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const record of records || []) {
    const key = dayKey(record?.[field]);
    const bucket = index.get(key);
    if (bucket) bucket.value += 1;
  }
  return buckets;
}

function withinPeriod(records, field, days, previous = false) {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const end = previous ? start : now;
  const from = previous ? now - days * 2 * 24 * 60 * 60 * 1000 : start;
  return (records || []).filter((record) => {
    const time = new Date(record?.[field]).getTime();
    return !Number.isNaN(time) && time >= from && time < end;
  });
}

function TrendChart({ buckets, emptyLabel = 'No activity in this period' }) {
  const gradientId = useId().replace(/:/g, '');
  const values = buckets.map((bucket) => bucket.value);
  const max = Math.max(1, ...values);
  const width = 720;
  const height = 148;
  const pad = 6;
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;
  const points = values.map((value, index) => {
    const x = pad + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
    const y = pad + usableHeight - (value / max) * usableHeight;
    return { x, y, value, label: buckets[index]?.label };
  });
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;
  const hasData = values.some((value) => value > 0);
  const first = buckets[0]?.label;
  const last = buckets[buckets.length - 1]?.label;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full overflow-visible" role="img" aria-label="Activity trend">
        <defs>
          <linearGradient id={`trend-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6821f" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#f6821f" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={pad}
            x2={width - pad}
            y1={pad + usableHeight * ratio}
            y2={pad + usableHeight * ratio}
            stroke="currentColor"
            className="text-cf-100 dark:text-cyber-800"
            strokeWidth="1"
            strokeDasharray={ratio === 1 ? undefined : '4 6'}
          />
        ))}
        <path d={area} fill={`url(#trend-${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="#f6821f"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={values[index] > 0 ? 2.6 : 0} fill="#f6821f">
            <title>{`${point.label ? point.label.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}: ${point.value}`}</title>
          </circle>
        ))}
      </svg>
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-md border border-cf-200 bg-white/90 px-2.5 py-1 text-[10px] font-medium text-cf-400 shadow-xs dark:border-cyber-800 dark:bg-cyber-900/90 dark:text-slate-500">
            {emptyLabel}
          </span>
        </div>
      )}
      {first && last && (
        <div className="mt-1 flex items-center justify-between text-[10px] font-medium text-cf-400 dark:text-slate-500">
          <span>{first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <span>{last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({ href, label, value, note, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-900/60 dark:bg-brand-950/35 dark:text-brand-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-400',
    sky: 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-400',
    slate: 'border-cf-200 bg-cf-100 text-cf-600 dark:border-cyber-700 dark:bg-cyber-850 dark:text-slate-300'
  };

  return (
    <Link href={href} className="card-hover group flex flex-col p-4">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-cf-500 dark:text-slate-400">
          {label}
        </span>
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </span>
      <span className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold leading-none text-cf-ink dark:text-white">{value}</span>
        {note && <span className="truncate text-[10px] text-cf-400 dark:text-slate-500">{note}</span>}
      </span>
    </Link>
  );
}

function QuickAction({ href, label, icon: Icon }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-lg border border-cf-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-cf-700 shadow-xs transition-all hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-800 dark:border-cyber-800 dark:bg-cyber-900 dark:text-slate-300 dark:hover:border-brand-800 dark:hover:bg-brand-950/20 dark:hover:text-brand-200"
    >
      <Icon className="h-4 w-4 text-cf-400 group-hover:text-brand-600 dark:text-slate-500 dark:group-hover:text-brand-400" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowRightIcon className="h-3 w-3 text-cf-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-slate-600 rtl:rotate-180" />
    </Link>
  );
}

export default function OverviewDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [quickCreating, setQuickCreating] = useState(false);
  const [adminUser, setAdminUser] = useState(false);
  const [user, setUser] = useState(null);
  const [period, setPeriod] = useState(30);
  const [today, setToday] = useState('');

  useEffect(() => {
    setAdminUser(isAdmin());
    setUser(getUser());
    setToday(
      new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
    );
  }, []);

  const { data: aliasesData, isLoading: loadingAliases, mutate: mutateAliases } = useSWR('overview-aliases', () =>
    api.getAliases({ limit: 100 })
  );
  const { data: emailsData, isLoading: loadingEmails } = useSWR('overview-emails', () => api.getEmails({ limit: 100 }));
  const { data: subdomainsData } = useSWR('overview-subdomains', () => api.getSubdomains({ limit: 100 }));
  const { data: domainsData } = useSWR('overview-domains', () => api.getDomainList());
  const { data: allowedDomainsData } = useSWR('overview-allowed-domains', () => api.getDomains());
  const { data: hostingData } = useSWR('overview-hosting', () => api.getHostingSites());
  const { data: nodesData } = useSWR(adminUser ? 'overview-nodes' : null, () => api.getHostingNodes());
  const { data: apiKeysData } = useSWR('overview-api-keys', () => api.getApiKeys());
  const { data: appsData } = useSWR('overview-apps', () => api.getApplications());
  const { data: backupsData } = useSWR(adminUser ? 'overview-backups' : null, () => api.getBackups());
  const { data: readiness } = useSWR('overview-readiness', fetchReadiness, { refreshInterval: 30000 });

  async function fetchReadiness() {
    try {
      const response = await fetch('/api/ready');
      return await response.json();
    } catch {
      return { status: 'unknown', checks: {} };
    }
  }

  const aliases = aliasesData?.aliases || [];
  const activeAliases = aliases.filter((alias) => alias.active);
  const burnerAliases = aliases.filter((alias) => alias.burner);

  const emails = emailsData?.emails || [];
  const totalEmails = emailsData?.total ?? emails.length;
  const unreadEmails = emails.filter((email) => !email.is_read).length;

  const subdomains = subdomainsData?.subdomains || [];
  const domainInventory = Array.isArray(domainsData) ? domainsData : [];
  const allowedDomains = allowedDomainsData?.domains || [];
  const sites = hostingData?.sites || [];
  const nodes = nodesData?.nodes || [];
  const apiKeys = apiKeysData?.keys || [];
  const apps = appsData?.applications || [];
  const backups = backupsData?.backups || [];

  const domains = useMemo(() => {
    const names = domainInventory.map((domain) => domain?.domain).filter(Boolean);
    if (names.length > 0) return [...new Set(names)];
    const routed = subdomains.map((subdomain) => subdomain.base_domain).filter(Boolean);
    const subdomainNames = new Set(subdomains.map((subdomain) => subdomain.full_domain));
    const roots = allowedDomains.filter((name) => !subdomainNames.has(name));
    return [...new Set([...routed, ...roots])];
  }, [domainInventory, allowedDomains, subdomains]);

  const domainNames = domains;

  const domainStatusById = useMemo(() => {
    const map = new Map();
    for (const record of domainInventory) map.set(record.domain, record);
    return map;
  }, [domainInventory]);

  const emailSeries = useMemo(() => buildSeries(emails, 'received_at', period), [emails, period]);
  const aliasSeries = useMemo(() => buildSeries(aliases, 'created_at', period), [aliases, period]);
  const periodEmails = useMemo(() => withinPeriod(emails, 'received_at', period), [emails, period]);
  const previousEmails = useMemo(() => withinPeriod(emails, 'received_at', period, true), [emails, period]);
  const periodAliases = useMemo(() => withinPeriod(aliases, 'created_at', period), [aliases, period]);
  const previousAliases = useMemo(() => withinPeriod(aliases, 'created_at', period, true), [aliases, period]);

  const emailDelta = previousEmails.length === 0 ? (periodEmails.length > 0 ? 100 : 0) : Math.round(((periodEmails.length - previousEmails.length) / previousEmails.length) * 100);
  const aliasDelta = previousAliases.length === 0 ? (periodAliases.length > 0 ? 100 : 0) : Math.round(((periodAliases.length - previousAliases.length) / previousAliases.length) * 100);

  const healthStatus = readiness?.status || 'checking';
  const healthOk = healthStatus === 'ready';
  const healthDegraded = healthStatus === 'degraded' || healthStatus === 'unknown';

  const setupSteps = [
    { label: 'Configure a domain', done: domainNames.length > 0, href: '/subdomains', icon: GlobeAmericasIcon },
    { label: 'Create an email alias', done: aliases.length > 0, href: '/aliases', icon: AtSymbolIcon },
    { label: 'Publish a route', done: subdomains.length > 0, href: '/subdomains', icon: ArrowsRightLeftIcon },
    { label: 'Deploy an application', done: apps.length > 0, href: '/applications', icon: CommandLineIcon },
    ...(adminUser ? [{ label: 'Create a recovery point', done: backups.length > 0, href: '/backups', icon: CircleStackIcon }] : [])
  ];
  const setupComplete = setupSteps.filter((step) => step.done).length;
  const nextStep = setupSteps.find((step) => !step.done);

  async function handleQuickInstantAlias() {
    setQuickCreating(true);
    try {
      const domain = domains[0];
      if (!domain) throw new Error('No email domain is configured. Ask an administrator to configure DOMAINS.');
      const created = await api.createAlias({ domain });
      toast.success(`New alias created\n${created.address}`, { duration: 5000 });
      mutateAliases();
    } catch (error) {
      toast.error(error.message || 'Failed to create alias');
    } finally {
      setQuickCreating(false);
    }
  }

  async function handleQuickBurner() {
    setQuickCreating(true);
    try {
      const domain = domains[0];
      if (!domain) throw new Error('No email domain is configured. Ask an administrator to configure DOMAINS.');
      const created = await api.createBurner(domain);
      toast.success(`1-hour burner created\n${created.address}`, { duration: 5000 });
      mutateAliases();
    } catch (error) {
      toast.error(error.message || 'Failed to create burner');
    } finally {
      setQuickCreating(false);
    }
  }

  function openSearch() {
    window.dispatchEvent(new Event('app:open-command'));
  }

  const displayName = user?.username ? `@${user.username}` : user?.first_name || user?.name || 'there';
  const runningApps = apps.filter((app) => ['running', 'healthy', 'deployed'].includes(app.status)).length;
  const recentEmails = [...emails].sort((a, b) => new Date(b.received_at) - new Date(a.received_at)).slice(0, 3);

  return (
    <div className="page-container space-y-7">
      <section className="relative mx-auto max-w-3xl pt-3 text-center sm:pt-6">
        <div className="pointer-events-none absolute inset-x-10 -top-6 -z-10 h-40 rounded-full bg-brand-200/30 blur-3xl dark:bg-brand-900/10" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              healthOk
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${healthOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {healthOk ? 'All systems operational' : healthDegraded ? 'Service status needs attention' : 'Checking platform status'}
          </span>
          {today && <span className="text-[10px] font-medium text-cf-400 dark:text-slate-500">{today}</span>}
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cf-400 dark:text-slate-500">
          Account home · Welcome back, {displayName}
        </p>
        <h1 className="mt-2 font-display text-[34px] font-bold leading-[1.1] tracking-tight text-cf-ink dark:text-white sm:text-[44px]">
          What&apos;s on the agenda?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-6 text-cf-500 dark:text-slate-400">
          Build, route, and operate your cloud from one place. Start with a domain, a deployment, or a quick inbox.
        </p>

        <button
          type="button"
          onClick={openSearch}
          className="group mx-auto mt-6 flex h-12 w-full max-w-xl items-center gap-3 rounded-xl border border-cf-300 bg-white px-4 text-left text-[13px] text-cf-400 shadow-card transition-all hover:border-brand-300 hover:shadow-popover dark:border-cyber-700 dark:bg-cyber-900 dark:text-slate-500 dark:hover:border-brand-800"
          aria-label="Search the dashboard"
        >
          <MagnifyingGlassIcon className="h-4.5 w-4.5 flex-shrink-0 group-hover:text-brand-500" />
          <span className="min-w-0 flex-1 truncate">Search domains, applications, aliases and settings…</span>
          <span className="kbd">⌘ K</span>
        </button>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={handleQuickInstantAlias} disabled={quickCreating} className="btn-secondary h-8 px-2.5 text-[11px]">
            <PlusIcon className="h-3.5 w-3.5 text-brand-500" />
            {t('aliases.new_btn', 'New alias')}
          </button>
          <button type="button" onClick={handleQuickBurner} disabled={quickCreating} className="btn-secondary h-8 px-2.5 text-[11px]">
            <FireIcon className="h-3.5 w-3.5 text-rose-500" />
            {quickCreating ? 'Working…' : t('nav.burner_quick', '1-hour burner')}
          </button>
          <Link href="/subdomains" className="btn-secondary h-8 px-2.5 text-[11px]">
            <ArrowsRightLeftIcon className="h-3.5 w-3.5 text-brand-500" />
            Add route
          </Link>
          <Link href="/applications" className="btn-secondary h-8 px-2.5 text-[11px]">
            <RocketLaunchIcon className="h-3.5 w-3.5 text-brand-500" />
            Deploy app
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          href="/aliases"
          label={t('overview.stat_aliases', 'Active aliases')}
          value={loadingAliases ? '—' : activeAliases.length}
          note={`${aliases.length} total · ${burnerAliases.length} burner${burnerAliases.length === 1 ? '' : 's'}`}
          icon={AtSymbolIcon}
        />
        <MetricCard
          href="/inbox"
          label={t('overview.stat_inboxes', 'Messages')}
          value={loadingEmails ? '—' : totalEmails}
          note={`${unreadEmails} unread`}
          icon={InboxIcon}
          tone="sky"
        />
        <MetricCard
          href="/subdomains"
          label={t('overview.stat_subdomains', 'Routes')}
          value={subdomains.length}
          note={`${domainNames.length} domain${domainNames.length === 1 ? '' : 's'}`}
          icon={GlobeAmericasIcon}
          tone="emerald"
        />
        <MetricCard
          href="/applications"
          label={t('nav.applications', 'Applications')}
          value={apps.length}
          note={apps.length ? `${runningApps} running` : `${sites.length} edge sites`}
          icon={CommandLineIcon}
          tone="slate"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
            <h2 className="font-display text-[15px] font-bold text-cf-ink dark:text-white">Domains</h2>
            <Link href="/subdomains" className="text-[11px] font-semibold text-cf-400 hover:text-brand-700 dark:text-slate-500 dark:hover:text-brand-300">
              View all
            </Link>
          </div>
          <div className="flex-1 divide-y divide-cf-100 dark:divide-cyber-800/70">
            {domainNames.length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-state-icon">
                  <GlobeAltIcon className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-cf-700 dark:text-slate-200">No domains connected</p>
                <p className="mt-1 max-w-[240px] text-[11px] leading-5 text-cf-500 dark:text-slate-400">
                  Add your first domain to start routing services and receiving mail.
                </p>
                <Link href="/subdomains" className="btn-primary mt-3 h-8 px-3 text-[11px]">
                  Connect a domain
                </Link>
              </div>
            ) : (
              domainNames.slice(0, 3).map((domain) => {
                const count = subdomains.filter((subdomain) => subdomain.base_domain === domain).length;
                const record = domainStatusById.get(domain);
                const healthy = record ? Boolean(record.verified) || record.dns_status === 'healthy' : true;
                return (
                  <Link key={domain} href="/subdomains" className="group flex items-center gap-3 px-4 py-3 hover:bg-cf-50 dark:hover:bg-cyber-850/50">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cf-200 bg-cf-50 text-cf-500 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-400">
                      <GlobeAmericasIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] font-semibold text-cf-ink dark:text-slate-100">{domain}</span>
                      <span className="mt-0.5 block text-[10px] text-cf-400 dark:text-slate-500">
                        {count ? `${count} route${count === 1 ? '' : 's'}` : 'Mail domain'}
                      </span>
                    </span>
                    <span className={healthy ? 'badge-green' : 'badge-yellow'}>{healthy ? 'Active' : 'Pending'}</span>
                  </Link>
                );
              })
            )}
          </div>
          {domainNames.length > 3 && (
            <div className="border-t border-cf-200 px-4 py-2.5 text-[10px] text-cf-400 dark:border-cyber-800 dark:text-slate-500">
              +{domainNames.length - 3} more domain{domainNames.length - 3 === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div className="card overflow-hidden lg:col-span-4">
          <div className="border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
            <h2 className="font-display text-[15px] font-bold text-cf-ink dark:text-white">Build something new</h2>
          </div>
          <div className="space-y-3 p-4">
            <Link
              href="/applications"
              className="group relative block overflow-hidden rounded-lg border border-brand-200 bg-brand-50/70 p-4 transition-colors hover:border-brand-300 dark:border-brand-900/60 dark:bg-brand-950/25 dark:hover:border-brand-800"
            >
              <div className="absolute -right-5 -top-6 h-20 w-20 rounded-full border-[14px] border-brand-200/60 dark:border-brand-900/30" />
              <div className="relative flex items-start gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm">
                  <RocketLaunchIcon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[12px] font-bold text-cf-ink dark:text-white">Ship something new</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-cf-600 dark:text-slate-400">
                    Deploy a Git application with logs, health checks, and rollback.
                  </span>
                </span>
              </div>
            </Link>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <QuickAction href="/aliases" label="New alias" icon={AtSymbolIcon} />
              <QuickAction href="/subdomains" label="Add route" icon={ArrowsRightLeftIcon} />
              <QuickAction href="/hosting" label="Publish site" icon={GlobeAltIcon} />
              <QuickAction href="/api-keys" label="API key" icon={KeyIcon} />
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-cf-200 px-4 py-2.5 dark:border-cyber-800">
            <span className="text-[10px] text-cf-400 dark:text-slate-500">{apps.length} app{apps.length === 1 ? '' : 's'} · {sites.length} site{sites.length === 1 ? '' : 's'}</span>
            <Link href="/applications" className="flex items-center gap-1 text-[10px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200">
              Deployments
              <ArrowRightIcon className="h-3 w-3 rtl:rotate-180" />
            </Link>
          </div>
        </div>

        <div className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
            <h2 className="font-display text-[15px] font-bold text-cf-ink dark:text-white">Recents</h2>
            <Link href="/inbox" className="text-[11px] font-semibold text-cf-400 hover:text-brand-700 dark:text-slate-500 dark:hover:text-brand-300">
              Inbox
            </Link>
          </div>
          <div className="flex-1 divide-y divide-cf-100 dark:divide-cyber-800/70">
            {recentEmails.length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-state-icon">
                  <InboxIcon className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-cf-700 dark:text-slate-200">No recent mail</p>
                <p className="mt-1 max-w-[230px] text-[11px] leading-5 text-cf-500 dark:text-slate-400">
                  Messages and verification codes will show up here in real time.
                </p>
              </div>
            ) : (
              recentEmails.map((email) => {
                const code = extractVerificationCode(email.subject, email.text_body);
                const sender = email.sender_name || email.sender || 'Unknown';
                return (
                  <Link key={email.id} href={`/inbox/${email.id}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-cf-50 dark:hover:bg-cyber-850/50">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cf-200 bg-cf-50 text-[10px] font-bold text-cf-600 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-300">
                      {sender.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-[12px] ${email.is_read ? 'font-medium text-cf-700 dark:text-slate-300' : 'font-semibold text-cf-ink dark:text-white'}`}>
                          {email.subject || '(no subject)'}
                        </span>
                        {!email.is_read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cf-400 dark:text-slate-500">
                        <span className="truncate">{sender}</span>
                        <span>·</span>
                        <span className="flex-shrink-0">{formatTimeAgo(email.received_at)}</span>
                      </span>
                      {code && <span className="mt-1 inline-flex rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-300">{code}</span>}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
          <div className="mt-auto border-t border-cf-200 px-4 py-2.5 dark:border-cyber-800">
            <Link href="/settings" className="flex items-center gap-1.5 text-[10px] font-medium text-cf-400 hover:text-cf-700 dark:text-slate-500 dark:hover:text-slate-300">
              <ClockIcon className="h-3 w-3" />
              Settings & audit trail
              <ChevronRightIcon className="h-3 w-3 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden sm:flex">
        <div className="relative hidden w-48 flex-shrink-0 overflow-hidden bg-brand-500 sm:block">
          <div className="absolute -left-7 -top-8 h-28 w-28 rounded-full border-[18px] border-white/15" />
          <div className="absolute -bottom-12 -right-3 h-36 w-36 rounded-full border-[22px] border-white/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BrandBannerMark />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="badge-brand">New</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cf-400 dark:text-slate-500">Commandor v1.0</span>
            </div>
            <h2 className="mt-2 font-display text-[17px] font-bold text-cf-ink dark:text-white">A more dependable control plane</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-cf-500 dark:text-slate-400">
              Local app runner, verified backup restores, scoped API keys, and a hardened network layer are ready in this release.
            </p>
          </div>
          <a
            href="https://github.com/Masrofii/Commandor_dev_pack/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary h-9 flex-shrink-0 px-3"
          >
            <DocumentTextIcon className="h-4 w-4" />
            See what&apos;s new
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-[21px] font-bold text-cf-ink dark:text-white">Analytics</h2>
            <p className="mt-0.5 text-[11px] text-cf-500 dark:text-slate-400">A live view of inbound mail and address creation.</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-cf-200 bg-white p-0.5 shadow-xs dark:border-cyber-800 dark:bg-cyber-900">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriod(item.id)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                  period === item.id
                    ? 'bg-cf-100 text-cf-ink dark:bg-cyber-800 dark:text-white'
                    : 'text-cf-400 hover:text-cf-700 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button type="button" onClick={() => router.refresh()} className="icon-btn h-7 w-7" title="Refresh analytics">
              <ArrowPathIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cf-500 dark:text-slate-400">Inbound mail</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-[28px] font-bold leading-none text-cf-ink dark:text-white">{periodEmails.length}</span>
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${emailDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {emailDelta >= 0 ? <ArrowTrendingUpIcon className="h-3 w-3" /> : <ArrowTrendingDownIcon className="h-3 w-3" />}
                    {Math.abs(emailDelta)}%
                  </span>
                  <span className="text-[10px] text-cf-400 dark:text-slate-500">vs previous {period}d</span>
                </div>
              </div>
              <span className="badge-gray">{period} days</span>
            </div>
            <div className="mt-4">
              <TrendChart buckets={emailSeries} emptyLabel="No messages in this period" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-cf-100 pt-3 text-[10px] text-cf-400 dark:border-cyber-800 dark:text-slate-500">
              <span>{unreadEmails} unread in your recent mailbox</span>
              <Link href="/inbox" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">Open inbox</Link>
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cf-500 dark:text-slate-400">Aliases created</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-[28px] font-bold leading-none text-cf-ink dark:text-white">{periodAliases.length}</span>
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${aliasDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {aliasDelta >= 0 ? <ArrowTrendingUpIcon className="h-3 w-3" /> : <ArrowTrendingDownIcon className="h-3 w-3" />}
                    {Math.abs(aliasDelta)}%
                  </span>
                  <span className="text-[10px] text-cf-400 dark:text-slate-500">vs previous {period}d</span>
                </div>
              </div>
              <span className="badge-gray">{activeAliases.length} active</span>
            </div>
            <div className="mt-4">
              <TrendChart buckets={aliasSeries} emptyLabel="No new aliases in this period" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-cf-100 pt-3 text-[10px] text-cf-400 dark:border-cyber-800 dark:text-slate-500">
              <span>{burnerAliases.length} temporary burner{burnerAliases.length === 1 ? '' : 's'}</span>
              <Link href="/aliases" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">Manage aliases</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card flex flex-col">
          <div className="flex items-center justify-between border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
            <div>
              <h2 className="font-display text-[15px] font-bold text-cf-ink dark:text-white">Workspace setup</h2>
              <p className="mt-0.5 text-[10px] text-cf-400 dark:text-slate-500">{setupComplete} of {setupSteps.length} complete</p>
            </div>
            <span className={`badge ${setupComplete === setupSteps.length ? 'badge-green' : 'badge-brand'}`}>
              {Math.round((setupComplete / setupSteps.length) * 100)}%
            </span>
          </div>
          <div className="flex-1 p-4">
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-cf-100 dark:bg-cyber-850">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.max(4, Math.round((setupComplete / setupSteps.length) * 100))}%` }}
              />
            </div>
            <div className="space-y-1">
              {setupSteps.map((step) => {
                const Icon = step.done ? CheckCircleIcon : step.icon;
                return (
                  <Link
                    key={step.label}
                    href={step.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-cf-50 dark:hover:bg-cyber-850/60 ${
                      step.done ? 'text-cf-400 dark:text-slate-500' : 'font-medium text-cf-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${step.done ? 'text-emerald-500' : 'text-cf-400 dark:text-slate-500'}`} />
                    <span className={`flex-1 ${step.done ? 'line-through decoration-cf-300 dark:decoration-cyber-700' : ''}`}>{step.label}</span>
                    {!step.done && <ArrowRightIcon className="h-3 w-3 text-cf-300 dark:text-slate-600 rtl:rotate-180" />}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="border-t border-cf-200 px-4 py-2.5 dark:border-cyber-800">
            {nextStep ? (
              <Link href={nextStep.href} className="flex items-center gap-1.5 text-[10px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200">
                Next: {nextStep.label}
                <ArrowRightIcon className="h-3 w-3 rtl:rotate-180" />
              </Link>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Everything is set up and ready.
              </span>
            )}
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="flex items-center justify-between border-b border-cf-200 px-4 py-3 dark:border-cyber-800">
            <div>
              <h2 className="font-display text-[15px] font-bold text-cf-ink dark:text-white">Service health</h2>
              <p className="mt-0.5 text-[10px] text-cf-400 dark:text-slate-500">Live checks from the control plane</p>
            </div>
            <Link href={adminUser ? '/monitoring' : '/settings'} className="text-[10px] font-semibold text-cf-400 hover:text-brand-700 dark:text-slate-500 dark:hover:text-brand-300">
              Details
            </Link>
          </div>
          <div className="flex-1 divide-y divide-cf-100 dark:divide-cyber-800/70">
            {[
              { label: 'API gateway', key: 'api', status: healthOk ? 'ok' : healthStatus === 'checking' ? 'checking' : 'error', detail: 'Control plane' },
              { label: 'Database', key: 'database', status: readiness?.checks?.database || 'checking', detail: 'SQLite WAL' },
              { label: 'Object storage', key: 'storage', status: readiness?.checks?.storage || 'checking', detail: 'Uploads & backups' },
              { label: 'Domain configuration', key: 'config', status: readiness?.checks?.config || 'checking', detail: domainNames.length ? `${domainNames.length} domain${domainNames.length === 1 ? '' : 's'}` : 'Not configured' },
              { label: 'Realtime updates', key: 'realtime', status: healthOk ? 'ok' : 'checking', detail: 'WebSocket hub' }
            ].map((service) => {
              const statusOk = service.status === 'ok' || service.status === 'active';
              const statusWarn = service.status === 'warning' || service.status === 'checking';
              return (
                <div key={service.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border ${statusOk ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400' : statusWarn ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400' : 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400'}`}>
                    {statusOk ? <CheckCircleIcon className="h-4 w-4" /> : statusWarn ? <ExclamationTriangleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-cf-700 dark:text-slate-200">{service.label}</span>
                    <span className="block text-[10px] text-cf-400 dark:text-slate-500">{service.detail}</span>
                  </span>
                  <span className={`text-[10px] font-semibold capitalize ${statusOk ? 'text-emerald-600 dark:text-emerald-400' : statusWarn ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {statusOk ? 'Operational' : service.status}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-cf-200 px-4 py-2.5 text-[10px] text-cf-400 dark:border-cyber-800 dark:text-slate-500">
            {apiKeys.length} API key{apiKeys.length === 1 ? '' : 's'} · {nodes.length} node{nodes.length === 1 ? '' : 's'} · {backups.length && adminUser ? `${backups.length} recovery point${backups.length === 1 ? '' : 's'}` : 'recovery ready'}
          </div>
        </div>
      </section>

      {adminUser && (
        <section>
          <InfrastructureTopologyMap />
        </section>
      )}
    </div>
  );
}

function BrandBannerMark() {
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur">
      <SparklesIcon className="h-8 w-8" />
    </span>
  );
}
