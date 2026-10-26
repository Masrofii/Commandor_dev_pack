'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api } from '../../../lib/api';
import { isAdmin } from '../../../lib/auth';
import { formatTimeAgo } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import InfrastructureTopologyMap from '../../../components/InfrastructureTopologyMap';
import {
  SignalIcon,
  CpuChipIcon,
  ServerStackIcon,
  GlobeAltIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CircleStackIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export default function MonitoringPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      router.replace('/');
      return;
    }
    setAdminUser(true);
  }, [router]);

  const { data: overview, isLoading, mutate } = useSWR(adminUser ? 'monitoring-overview' : null, () => api.getSystemOverview(), {
    refreshInterval: 10000
  });

  const host = overview?.host || {};
  const nodes = overview?.nodes || {};
  const apps = overview?.applications || {};
  const domains = overview?.domains || {};
  const subdomains = overview?.subdomains || {};
  const security = overview?.security || {};
  const deployments = overview?.recentDeployments || [];
  const events = overview?.recentEvents || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <SignalIcon className="w-8 h-8 text-indigo-600 dark:text-cyan-400" />
            <span>{t('monitoring.title', 'Infrastructure Monitoring & Telemetry')}</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('monitoring.subtitle', 'Real-time host metrics, cluster node availability, container health, and platform activity.')}
          </p>
        </div>

        <button
          onClick={() => mutate()}
          className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 self-start"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('monitoring.refresh_btn', 'Refresh Metrics')}</span>
        </button>
      </div>

      {/* Resource-Capacity Warnings Banner */}
      {overview?.capacityWarnings && overview.capacityWarnings.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-800 space-y-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="font-bold flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span>Resource Capacity &amp; Operational Warnings ({overview.capacityWarnings.length})</span>
          </div>
          <div className="space-y-1 pl-7">
            {overview.capacityWarnings.map((w, idx) => (
              <div key={idx} className="flex items-center gap-2 font-mono text-[11px]">
                <span className={`px-1.5 py-0.5 rounded uppercase font-bold text-[9px] ${
                  w.level === 'critical' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {w.level}
                </span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Infrastructure Relationship Map (Phase 5) */}
      <InfrastructureTopologyMap />

      {/* Host Specs Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU & Load */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <CpuChipIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              <span>{t('monitoring.cpu_usage', 'CPU Load')}</span>
            </span>
            <span className="font-mono text-[11px]">{host.cpuCount ? `${host.cpuCount} Cores` : '...'}</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {host.loadAvg ? host.loadAvg[0] : '0.00'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Load avg: {host.loadAvg ? `${host.loadAvg[0]}, ${host.loadAvg[1]}, ${host.loadAvg[2]}` : 'N/A'}
          </p>
        </div>

        {/* Memory Usage */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <CircleStackIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>{t('monitoring.memory_usage', 'Memory Usage')}</span>
            </span>
            <span className="font-mono text-[11px]">{host.memory?.usagePercent || 0}% used</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {host.memory?.usedMb || 0} <span className="text-sm font-normal text-slate-400">/ {host.memory?.totalMb || 0} MB</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-cyber-850 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-cyan-500 h-full rounded-full transition-all"
              style={{ width: `${host.memory?.usagePercent || 0}%` }}
            />
          </div>
        </div>

        {/* Host Disk */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <ServerStackIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('monitoring.storage_usage', 'Disk Storage')}</span>
            </span>
            <span className="font-mono text-[11px]">{host.disk?.usagePercent || 0}% used</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {host.disk ? Math.round(host.disk.usedBytes / (1024 * 1024 * 1024)) : 0} <span className="text-sm font-normal text-slate-400">/ {host.disk ? Math.round(host.disk.totalBytes / (1024 * 1024 * 1024)) : 0} GB</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-cyber-850 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${host.disk?.usagePercent || 0}%` }}
            />
          </div>
        </div>

        {/* Uptime */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>System Uptime</span>
            </span>
            <span className="text-[11px] text-emerald-500 font-bold">Online</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
            {host.uptimeFormatted || '...'}
          </div>
          <p className="text-[11px] text-slate-500 truncate font-mono">
            {host.hostname || 'localhost'} ({host.arch || 'x64'})
          </p>
        </div>
      </div>

      {/* Cluster & Platform Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nodes Health */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <ServerStackIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              <span>Compute Nodes ({nodes.total || 0})</span>
            </h3>
            <span className="badge-cyan text-[10px] font-mono font-bold">Cluster</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <div className="font-bold text-base text-emerald-600 dark:text-emerald-400">{nodes.online || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Online</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800">
              <div className="font-bold text-base text-slate-600 dark:text-slate-400">{nodes.offline || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Offline</div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
              <div className="font-bold text-base text-rose-600 dark:text-rose-400">{nodes.error || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Errors</div>
            </div>
          </div>
        </div>

        {/* Applications Status */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Applications ({apps.total || 0})</span>
            </h3>
            <span className="badge-cyan text-[10px] font-mono font-bold">Services</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <div className="font-bold text-base text-emerald-600 dark:text-emerald-400">{apps.running || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Running</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800">
              <div className="font-bold text-base text-slate-600 dark:text-slate-400">{apps.stopped || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Stopped</div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
              <div className="font-bold text-base text-rose-600 dark:text-rose-400">{apps.failed || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Failed</div>
            </div>
          </div>
        </div>

        {/* Domains & Routing Status */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <GlobeAltIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              <span>Routing &amp; HTTPS</span>
            </h3>
            <span className="badge-cyan text-[10px] font-mono font-bold">Ingress</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-cyan-950/40 border border-indigo-200 dark:border-cyan-800">
              <div className="font-bold text-base text-indigo-600 dark:text-cyan-400">{domains.total || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Root Domains</div>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-cyan-950/40 border border-indigo-200 dark:border-cyan-800">
              <div className="font-bold text-base text-indigo-600 dark:text-cyan-400">{subdomains.proxyActive || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Active Routes</div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <div className="font-bold text-base text-emerald-600 dark:text-emerald-400">{subdomains.httpsActive || 0}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">TLS Secured</div>
            </div>
          </div>
        </div>
      </div>

      {/* Deployments & Audit Event Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Deployments */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-cyber-800 font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
            <span>Recent Deployments</span>
            <span className="text-xs text-slate-400 font-normal">Last 5 Jobs</span>
          </div>

          {deployments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No deployments triggered yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-cyber-800 text-xs">
              {deployments.map((d) => (
                <div key={d.id} className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-cyber-850/40">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{d.application_name}</span>
                      <code className="text-[10px] text-indigo-600 dark:text-cyan-400 font-bold">{d.commit_hash}</code>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {d.duration_ms}ms runtime • {formatTimeAgo(d.created_at)}
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase ${
                    d.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                    'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {d.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Events */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-cyber-800 font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
            <span>Audit Trail &amp; Events</span>
            <span className="text-xs text-slate-400 font-normal">Immutable Logs</span>
          </div>

          {events.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No audit events recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-cyber-800 text-xs">
              {events.map((e) => (
                <div key={e.id} className="p-3.5 px-5 space-y-0.5 hover:bg-slate-50/50 dark:hover:bg-cyber-850/40">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{e.action}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{formatTimeAgo(e.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{e.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
