'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';
import { useTranslation } from '../lib/i18n';
import {
  GlobeAltIcon,
  ServerStackIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  QuestionMarkCircleIcon,
  ArrowsRightLeftIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline';

const STATE_COLORS = {
  healthy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
  degraded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800',
  unhealthy: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800',
  unknown: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700'
};

const BADGE_ICONS = {
  healthy: <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500 inline-block mr-1" />,
  degraded: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 inline-block mr-1" />,
  unhealthy: <XCircleIcon className="w-3.5 h-3.5 text-rose-500 inline-block mr-1" />,
  failed: <XCircleIcon className="w-3.5 h-3.5 text-rose-500 inline-block mr-1" />,
  unknown: <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-slate-400 inline-block mr-1" />
};

export default function InfrastructureTopologyMap() {
  const { t } = useTranslation();
  const { data: topology, isLoading, mutate } = useSWR('infra-topology', () => api.getInfrastructureTopology(), {
    refreshInterval: 15000
  });

  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all');

  const nodes = topology?.nodes || [];
  const edges = topology?.edges || [];
  const summary = topology?.summary || {};

  const filteredNodes = filterType === 'all' ? nodes : nodes.filter(n => n.type === filterType || n.category === filterType);

  const dnsProviders = nodes.filter(n => n.type === 'dns_provider');
  const domains = nodes.filter(n => n.type === 'domain');
  const subdomains = nodes.filter(n => n.type === 'subdomain');
  const applications = nodes.filter(n => n.type === 'application');
  const vpsNodes = nodes.filter(n => n.type === 'node');

  return (
    <div className="card p-5 sm:p-6 space-y-5 border-slate-200 dark:border-cyber-800">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-cyber-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-cyan-950/80 text-indigo-600 dark:text-cyan-400">
              <ArrowsRightLeftIcon className="w-5 h-5" />
            </span>
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {t('topology.title', 'Infrastructure Relationship Map & Topology')}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('topology.subtitle', 'Live multi-stage dependency map connecting DNS providers, root domains, edge subdomains, proxy routes, applications, and cluster VPS nodes.')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Filter Pills */}
          <div className="flex rounded-lg bg-slate-100 dark:bg-cyber-850 p-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            {['all', 'domain', 'routing', 'service', 'node'].map(tKey => (
              <button
                key={tKey}
                onClick={() => setFilterType(tKey)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  filterType === tKey
                    ? 'bg-white dark:bg-cyber-750 text-indigo-600 dark:text-cyan-400 font-bold shadow-xs'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(`topology.filter_${tKey}`, tKey === 'all' ? 'All' : tKey)}
              </button>
            ))}
          </div>

          <button
            onClick={() => mutate()}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-cyber-800 hover:bg-slate-100 dark:hover:bg-cyber-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title={t('topology.refresh', 'Refresh Topology')}
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Legend & Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 dark:bg-cyber-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-cyber-800/60 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">{t('topology.health_status', 'Health Status:')}</span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t('topology.healthy', 'Healthy')}
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> {t('topology.degraded', 'Degraded')}
          </span>
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> {t('topology.unhealthy', 'Unhealthy / Failed')}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> {t('topology.unknown', 'Unknown / Pending')}
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
          <span>{summary.domainsCount || 0} {t('topology.filter_domain', 'Domains')}</span>
          <span>•</span>
          <span>{summary.subdomainsCount || 0} {t('nav.subdomains', 'Subdomains')}</span>
          <span>•</span>
          <span>{summary.applicationsCount || 0} {t('nav.applications', 'Apps')}</span>
          <span>•</span>
          <span>{summary.nodesCount || 0} {t('nav.nodes', 'Nodes')}</span>
        </div>
      </div>

      {/* 5-Column Visual Architecture Flow */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pt-2 pb-2">
        {/* Tier 1: DNS Providers */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-cyber-800">
            <GlobeAltIcon className="w-3.5 h-3.5" />
            <span>{t('topology.tier_dns', '1. DNS Providers')}</span>
          </div>
          <div className="space-y-2">
            {dnsProviders.map(n => (
              <div
                key={n.id}
                onClick={() => setSelectedNode(n)}
                className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                  selectedNode?.id === n.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                } ${STATE_COLORS[n.healthState] || STATE_COLORS.unknown}`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>{n.label}</span>
                  {BADGE_ICONS[n.healthState]}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">{t('topology.dns_authoritative', 'Authoritative Zone Host')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 2: Custom Domains */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-cyber-800">
            <GlobeAltIcon className="w-3.5 h-3.5" />
            <span>{t('topology.tier_domains', '2. Domains')} ({domains.length})</span>
          </div>
          <div className="space-y-2">
            {domains.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-cyber-800 text-[11px] text-slate-400 text-center">
                {t('topology.no_domains', 'No root domains')}
              </div>
            ) : (
              domains.map(n => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    selectedNode?.id === n.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                  } ${STATE_COLORS[n.healthState] || STATE_COLORS.unknown}`}
                >
                  <div className="font-bold flex items-center justify-between truncate">
                    <span className="truncate">{n.label}</span>
                    {BADGE_ICONS[n.healthState]}
                  </div>
                  <div className="text-[10px] font-mono mt-1 opacity-80">
                    DNS: {n.data?.dnsStatus || (n.data?.verified ? 'verified' : 'pending')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tier 3: Edge Subdomains & Proxy Routes */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-cyber-800">
            <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
            <span>{t('topology.tier_subdomains', '3. Subdomains & Proxy')} ({subdomains.length})</span>
          </div>
          <div className="space-y-2">
            {subdomains.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-cyber-800 text-[11px] text-slate-400 text-center">
                {t('topology.no_subdomains', 'No subdomains')}
              </div>
            ) : (
              subdomains.map(n => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    selectedNode?.id === n.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                  } ${STATE_COLORS[n.healthState] || STATE_COLORS.unknown}`}
                >
                  <div className="font-bold flex items-center justify-between truncate">
                    <span className="truncate">{n.label}</span>
                    {BADGE_ICONS[n.healthState]}
                  </div>

                  {/* Multi-stage indicators */}
                  <div className="mt-2 pt-2 border-t border-slate-200/40 dark:border-cyber-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
                    <div className="bg-white/60 dark:bg-cyber-900/80 p-1 rounded">
                      <div>DNS</div>
                      <span className={`font-bold uppercase ${n.indicators?.dnsResolution === 'healthy' ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {n.indicators?.dnsResolution || 'none'}
                      </span>
                    </div>
                    <div className="bg-white/60 dark:bg-cyber-900/80 p-1 rounded">
                      <div>HTTP</div>
                      <span className={`font-bold uppercase ${n.indicators?.httpReachability === 'healthy' ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {n.indicators?.httpReachability || 'none'}
                      </span>
                    </div>
                    <div className="bg-white/60 dark:bg-cyber-900/80 p-1 rounded">
                      <div>TLS</div>
                      <span className={`font-bold uppercase ${n.indicators?.tlsValidity === 'healthy' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {n.indicators?.tlsValidity || 'off'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tier 4: Applications */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-cyber-800">
            <CommandLineIcon className="w-3.5 h-3.5" />
            <span>{t('topology.tier_apps', '4. Applications')} ({applications.length})</span>
          </div>
          <div className="space-y-2">
            {applications.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-cyber-800 text-[11px] text-slate-400 text-center">
                {t('topology.no_apps', 'No apps deployed')}
              </div>
            ) : (
              applications.map(n => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    selectedNode?.id === n.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                  } ${STATE_COLORS[n.healthState] || STATE_COLORS.unknown}`}
                >
                  <div className="font-bold flex items-center justify-between truncate">
                    <span className="truncate">{n.label}</span>
                    {BADGE_ICONS[n.healthState]}
                  </div>
                  <div className="text-[10px] font-mono mt-1 flex items-center justify-between opacity-80">
                    <span>Port: {n.data?.port || 3000}</span>
                    <span className="uppercase font-bold">{n.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tier 5: VPS Cluster Nodes */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-cyber-800">
            <ServerStackIcon className="w-3.5 h-3.5" />
            <span>{t('topology.tier_nodes', '5. VPS Nodes')} ({vpsNodes.length})</span>
          </div>
          <div className="space-y-2">
            {vpsNodes.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-cyber-800 text-[11px] text-slate-400 text-center">
                {t('topology.no_nodes', 'Local host only')}
              </div>
            ) : (
              vpsNodes.map(n => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    selectedNode?.id === n.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                  } ${STATE_COLORS[n.healthState] || STATE_COLORS.unknown}`}
                >
                  <div className="font-bold flex items-center justify-between truncate">
                    <span className="truncate">{n.label}</span>
                    {BADGE_ICONS[n.healthState]}
                  </div>
                  <div className="text-[10px] font-mono mt-1 opacity-80 truncate">
                    {n.data?.host} (SSH:{n.data?.port || 22})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 space-y-3 text-xs animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-400 uppercase text-[10px]">{t('topology.selected_node', 'Selected Node:')}</span>
              <strong className="text-sm font-bold text-slate-900 dark:text-white">{selectedNode.label}</strong>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border ${STATE_COLORS[selectedNode.healthState]}`}>
                {selectedNode.healthState}
              </span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
            >
              {t('common.close', 'Close')}
            </button>
          </div>

          <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] overflow-x-auto">
            {JSON.stringify(selectedNode.data || selectedNode, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
