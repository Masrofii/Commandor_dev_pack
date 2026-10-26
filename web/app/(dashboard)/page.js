'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { isAdmin } from '../../lib/auth';
import { extractVerificationCode, formatTimeAgo } from '../../lib/helpers';
import { useTranslation } from '../../lib/i18n';
import InfrastructureTopologyMap from '../../components/InfrastructureTopologyMap';
import {
  InboxIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  ServerStackIcon,
  KeyIcon,
  PlusIcon,
  FireIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CommandLineIcon,
  CpuChipIcon,
  SparklesIcon,
  CircleStackIcon,
  SignalIcon
} from '@heroicons/react/24/outline';

export default function OverviewDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [quickCreating, setQuickCreating] = useState(false);
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    setAdminUser(isAdmin());
  }, []);

  // Fetch real data from backend
  const { data: aliasesData, isLoading: loadingAliases, mutate: mutateAliases } = useSWR('overview-aliases', () => api.getAliases({ limit: 100 }));
  const { data: emailsData, isLoading: loadingEmails, mutate: mutateEmails } = useSWR('overview-emails', () => api.getEmails({ limit: 6 }));
  const { data: subdomainsData } = useSWR('overview-subdomains', () => api.getSubdomains({ limit: 50 }));
  const { data: domainsData } = useSWR('overview-domains', () => api.getDomains());
  const { data: hostingData } = useSWR('overview-hosting', () => api.getHostingSites());
  const { data: nodesData } = useSWR(adminUser ? 'overview-nodes' : null, () => api.getHostingNodes());
  const { data: apiKeysData } = useSWR('overview-api-keys', () => api.getApiKeys());
  const { data: appsData } = useSWR('overview-apps', () => api.getApplications());
  const { data: backupsData } = useSWR(adminUser ? 'overview-backups' : null, () => api.getBackups());

  const aliases = aliasesData?.aliases || [];
  const activeAliases = aliases.filter(a => a.active);
  const burnerAliases = aliases.filter(a => a.burner);

  const emails = emailsData?.emails || [];
  const totalEmails = emailsData?.total || 0;
  const unreadEmails = emails.filter(e => !e.is_read).length;

  const subdomains = subdomainsData?.subdomains || [];
  const domains = domainsData?.domains || [];
  const sites = hostingData?.sites || [];
  const nodes = nodesData?.nodes || [];
  const apiKeys = apiKeysData?.keys || [];
  const apps = appsData?.applications || [];
  const backups = backupsData?.backups || [];

  async function handleQuickInstantAlias() {
    setQuickCreating(true);
    try {
      const domain = domains[0];
      if (!domain) throw new Error('No email domain is configured. Ask an administrator to configure DOMAINS.');
      const created = await api.createAlias({ domain });
      toast.success(`New Alias Created:\n${created.address}`, { duration: 5000 });
      mutateAliases();
    } catch (err) {
      toast.error(err.message || 'Failed to create alias');
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
      toast.success(`1-Hour Burner Created:\n${created.address}`, { duration: 5000 });
      mutateAliases();
    } catch (err) {
      toast.error(err.message || 'Failed to create burner');
    } finally {
      setQuickCreating(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 pb-20">
      {/* Welcome Banner */}
      <div className="card-cyber p-6 sm:p-8 border-indigo-200/60 dark:border-cyber-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-cyan-950/60 text-indigo-700 dark:text-cyan-300 border border-indigo-200/60 dark:border-cyan-800/60">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>{t('overview.banner_tag', 'Commandor Dev Pack Control Center')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('overview.banner_title', 'Cloud Infrastructure & Self-Hosting Platform')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              {t('overview.banner_desc', 'Manage multi-node VPS clusters, provision subdomains with automatic DNS, route reverse proxies, deploy edge websites, and manage secure email aliases.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            {adminUser && (
              <Link
                href="/nodes"
                className="btn bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-cyan-300 border border-indigo-200 dark:border-indigo-900/60 py-2.5 px-4 text-xs sm:text-sm font-semibold flex items-center gap-1.5"
              >
                <ServerStackIcon className="w-4 h-4 text-indigo-500" />
                <span>{t('nav.nodes', 'Server Nodes')} ({nodes.length})</span>
              </Link>
            )}
            <button
              onClick={handleQuickInstantAlias}
              disabled={quickCreating}
              className="btn-primary py-2.5 px-4 text-xs sm:text-sm font-semibold shadow-md shadow-indigo-500/20"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{t('aliases.new_btn', 'Instant Alias')}</span>
            </button>
            <button
              onClick={handleQuickBurner}
              disabled={quickCreating}
              className="btn bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 py-2.5 px-4 text-xs sm:text-sm font-semibold"
            >
              <FireIcon className="w-4 h-4 text-rose-500" />
              <span>{t('nav.burner_quick', '1-Hour Burner')}</span>
            </button>
            <Link
              href="/inbox"
              className="btn-secondary py-2.5 px-4 text-xs sm:text-sm font-semibold"
            >
              <InboxIcon className="w-4 h-4 text-slate-500" />
              <span>{t('nav.inbox', 'View Inbox')}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Real Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Metric 1: Aliases */}
        <Link href="/aliases" className="card-hover p-5 space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('overview.stat_aliases', 'Active Aliases')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
              <AtSymbolIcon className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {loadingAliases ? '...' : activeAliases.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <span>{aliases.length} {t('common.all', 'total')}</span>
              <span>•</span>
              <span className="text-rose-500 font-medium">{burnerAliases.length} {t('nav.burner_quick', 'burners')}</span>
            </div>
          </div>
        </Link>

        {/* Metric 2: Inbox Messages */}
        <Link href="/inbox" className="card-hover p-5 space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('overview.stat_inboxes', 'Total Messages')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-100 dark:border-cyan-900/50 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
              <InboxIcon className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {loadingEmails ? '...' : totalEmails}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <span className={unreadEmails > 0 ? 'text-indigo-600 dark:text-cyan-400 font-semibold' : ''}>
                {unreadEmails} {t('inbox.filter_unread', 'unread')}
              </span>
              <span>•</span>
              <span>{t('nav.live_sync', 'Real-time sync')}</span>
            </div>
          </div>
        </Link>

        {/* Metric 3: Subdomains & Domains */}
        <Link href="/subdomains" className="card-hover p-5 space-y-3 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('overview.stat_subdomains', 'Domains & Routing')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
              <GlobeAltIcon className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {subdomains.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <span>{domains.length} {t('subdomains.tab_domains', 'domains')}</span>
              <span>•</span>
              <span>{t('subdomains.tab_subdomains', 'Proxy & Webhooks')}</span>
            </div>
          </div>
        </Link>

        {/* Metric 4: Cloud Edge (admin sees node counts, users see their own sites) */}
        {adminUser ? (
          <Link href="/nodes" className="card-hover p-5 space-y-3 group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('overview.stat_nodes', 'Servers & Nodes')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100 dark:border-violet-900/50 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform">
                <ServerStackIcon className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {nodes.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span>{sites.length} deployed sites</span>
                <span>•</span>
                <span className="text-emerald-500 font-medium">Cluster ready</span>
              </div>
            </div>
          </Link>
        ) : (
          <Link href="/hosting" className="card-hover p-5 space-y-3 group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('overview.stat_sites', 'Hosted Sites')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100 dark:border-violet-900/50 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform">
                <GlobeAltIcon className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {sites.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('overview.stat_sites_desc', 'Static sites deployed on the edge network')}
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Platform Infrastructure & Developer Tools Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/applications"
          className="card p-4 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
              <CommandLineIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{t('nav.applications', 'Applications')}</span>
                <span className="badge-cyan text-[10px] py-0 px-1.5">{apps.length}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Git deployments &amp; PM2/Docker</div>
            </div>
          </div>
          <ArrowRightIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors rtl:rotate-180" />
        </Link>

        {adminUser && (
          <Link
            href="/monitoring"
            className="card p-4 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <SignalIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{t('nav.monitoring', 'Telemetry')}</span>
                  <span className="badge-green text-[10px] py-0 px-1.5">{t('common.online', 'Live')}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">CPU, Memory, Logs &amp; Events</div>
              </div>
            </div>
            <ArrowRightIcon className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors rtl:rotate-180" />
          </Link>
        )}

        {adminUser && (
          <Link
            href="/backups"
            className="card p-4 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                <CircleStackIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{t('nav.backups', 'Disaster Recovery')}</span>
                  <span className="badge text-[10px] py-0 px-1.5 bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">{backups.length} {t('backups.title', 'Snapshots')}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">SQLite WAL &amp; Full System Zip</div>
              </div>
            </div>
            <ArrowRightIcon className="w-4 h-4 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors rtl:rotate-180" />
          </Link>
        )}
      </div>

      {/* Main Grid: Recent Activity Feed + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left Column: Recent Inbox Messages (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('overview.recent_emails', 'Recent Incoming Mail')}
              </h2>
              <p className="text-xs text-slate-500">{t('overview.recent_emails_desc', 'Live incoming email stream across your aliases')}</p>
            </div>
            <Link
              href="/inbox"
              className="text-xs font-semibold text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>{t('common.view_all', 'View All')}</span>
              <ArrowRightIcon className="w-3.5 h-3.5 rtl:rotate-180" />
            </Link>
          </div>

          <div className="card divide-y divide-slate-100 dark:divide-cyber-800 overflow-hidden">
            {loadingEmails ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="p-4 animate-pulse flex items-center gap-4">
                  <div className="w-9 h-9 bg-slate-200 dark:bg-cyber-800 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-1/3" />
                    <div className="h-3 bg-slate-200 dark:bg-cyber-800 rounded w-2/3" />
                  </div>
                </div>
              ))
            ) : emails.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
                  📬
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('overview.no_emails', 'No emails received yet')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {t('inbox.empty_desc', 'Incoming emails and verification codes will display here in real time.')}
                </p>
                <div className="pt-2">
                  <Link href="/aliases" className="btn-primary py-2 px-4 text-xs font-semibold">
                    {t('common.copy', 'Copy Alias Address')}
                  </Link>
                </div>
              </div>
            ) : (
              emails.map((e) => {
                const otp = extractVerificationCode(e.subject, e.text_body);
                const senderInitial = (e.sender_name || e.sender || '?')[0].toUpperCase();
                const timeAgo = formatTimeAgo(e.received_at);

                return (
                  <div
                    key={e.id}
                    onClick={() => router.push(`/inbox/${e.id}`)}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-cyber-850/60 cursor-pointer transition-colors flex items-start sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-cyber-800 flex items-center justify-center font-bold text-xs text-indigo-700 dark:text-cyan-300 flex-shrink-0 border border-indigo-200/60 dark:border-cyber-700">
                        {senderInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs truncate ${!e.is_read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                            {e.sender_name || e.sender}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate hidden md:inline">
                            → {e.alias_address}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs truncate ${!e.is_read ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                            {e.subject || '(no subject)'}
                          </span>
                          {otp && (
                            <span className="badge-cyan text-[10px] py-0 px-2 font-mono font-bold">
                              OTP: {otp}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {timeAgo}
                      </span>
                      <ArrowRightIcon className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Platform Services & System Health (1 col) */}
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CpuChipIcon className="w-4 h-4 text-cyan-500" />
                <span>{t('overview.service_health', 'Service Health')}</span>
              </h3>
              <span className="badge-green text-[10px]">{t('overview.all_operational', 'All Operational')}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850/70 border border-slate-200/60 dark:border-cyber-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{t('overview.api_gateway', 'API Gateway & Server')}</span>
                </div>
                <span className="text-slate-400 font-mono">Port 3000</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850/70 border border-slate-200/60 dark:border-cyber-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{t('overview.realtime_ws', 'Realtime WebSocket Hub')}</span>
                </div>
                <span className="text-slate-400 font-mono">Active /ws</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850/70 border border-slate-200/60 dark:border-cyber-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{t('overview.sqlite_storage', 'SQLite Storage Engine')}</span>
                </div>
                <span className="text-slate-400 font-mono">WAL Mode</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850/70 border border-slate-200/60 dark:border-cyber-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{t('overview.cloudflare_mx', 'Cloudflare MX Inbound')}</span>
                </div>
                <span className="text-slate-400 font-mono">Active</span>
              </div>
            </div>
          </div>

          {/* Quick Onboarding Tips */}
          <div className="card p-5 space-y-3 bg-gradient-to-br from-indigo-50/50 to-cyan-50/30 dark:from-cyber-900 dark:to-cyber-850 border-indigo-100 dark:border-cyber-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-indigo-500" />
              <span>{t('overview.quick_tips', 'Quick Tips')}</span>
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold">•</span>
                <span>{t('overview.tip_custom_aliases', 'Custom Aliases end with -ca@ to prevent conflicts with administrative usernames.')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold">•</span>
                <span>{t('overview.tip_subdomain_modes', 'Subdomain Modes: Run reverse proxies, webhook inspectors, or static landing pages under your own brand.')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold">•</span>
                <span>{t('overview.tip_telegram_bot', 'Telegram Bot: Connect via @{bot} to receive instant push alerts and 1-tap OTP copy buttons.', { bot: process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot' })}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Visual Infrastructure Relationship Map (Phase 5) */}
      {adminUser && <InfrastructureTopologyMap />}
    </div>
  );
}
