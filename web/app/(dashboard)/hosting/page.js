'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { isAdmin } from '../../../lib/auth';
import { formatMemoryMb } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import PageHeader, { PageTab } from '../../../components/PageHeader';
import {
  ServerStackIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  ArrowTopRightOnSquareIcon,
  DocumentArrowUpIcon,
  CodeBracketIcon,
  InformationCircleIcon,
  ChartBarIcon,
  CircleStackIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import Portal from '../../../components/Portal';

export default function HostingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('sites'); // 'sites' | 'nodes' | 'plans' | 'security'
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    setAdminUser(isAdmin());
  }, []);

  // Data fetching
  const { data: sitesData, isLoading: loadingSites, mutate: mutateSites } = useSWR('hosting-sites', api.getHostingSites);
  const { data: nodesData, isLoading: loadingNodes, mutate: mutateNodes } = useSWR(
    adminUser ? 'hosting-nodes' : null,
    api.getHostingNodes
  );
  const { data: plansData } = useSWR('hosting-plans', api.getHostingPlans);
  const { data: limitsData } = useSWR('hosting-limits', api.getHostingLimits);
  const { data: basesData } = useSWR('subdomain-bases', api.getSubdomainBases);
  const { data: logsData } = useSWR(
    adminUser ? 'hosting-logs' : null,
    () => api.getHostingSecurityLogs({ limit: 20 })
  );

  const sites = sitesData?.sites || [];
  const nodes = nodesData?.nodes || [];
  const plans = plansData?.plans || [];
  const hostingBaseDomain = basesData?.defaultDomain || basesData?.baseDomains?.[0] || '';
  const limits = limitsData || { canCreate: true, plan: { name: 'Free Tier', max_sites: 1 } };
  const logs = logsData?.logs || [];

  const activeSites = sites.filter((site) => site.status === 'active').length;
  const totalVisits = sites.reduce((sum, site) => sum + Number(site.visits_count || 0), 0);
  const storageKb = sites.reduce((sum, site) => sum + Number(site.storage_used_bytes || 0), 0) / 1024;
  const storageLabel = storageKb >= 1024 ? `${(storageKb / 1024).toFixed(1)} MB` : `${storageKb.toFixed(1)} KB`;
  const currentPlanName = limits?.plan?.name || '';

  // Deploy Site Modal
  const [showDeploy, setShowDeploy] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployMode, setDeployMode] = useState('html'); // 'html' | 'zip'
  const [siteForm, setSiteForm] = useState({
    name: '',
    rawHtml: '<h1>Welcome to my website!</h1>\n<p>Hosted on high-speed Commandor Cloud Edge.</p>',
    tosAccepted: true
  });
  const [zipFile, setZipFile] = useState(null);

  // Add Node Modal
  const [showAddNode, setShowAddNode] = useState(false);
  const [nodeModalTab, setNodeModalTab] = useState('single'); // 'single' | 'bulk'
  const [addingNode, setAddingNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({
    connection_string: '',
    name: '',
    public_url: ''
  });
  const [bulkNodesText, setBulkNodesText] = useState('');
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

  async function handleDeploy(e) {
    e.preventDefault();
    if (!siteForm.name.trim()) {
      toast.error('Site name is required');
      return;
    }
    if (!siteForm.tosAccepted) {
      toast.error('You must accept the Anti-Abuse Terms of Service');
      return;
    }

    setDeploying(true);
    try {
      if (deployMode === 'zip') {
        if (!zipFile) {
          toast.error('Please select a .zip archive');
          setDeploying(false);
          return;
        }
        const fd = new FormData();
        fd.append('name', siteForm.name);
        fd.append('tos_accepted', 'true');
        fd.append('zipFile', zipFile);
        await api.deployHostingSite(fd);
      } else {
        await api.deployHostingSite({
          name: siteForm.name,
          rawHtml: siteForm.rawHtml,
          tos_accepted: true
        });
      }

      toast.success('Site deployed and security scan passed!');
      setShowDeploy(false);
      setSiteForm({ name: '', rawHtml: '<h1>My Site</h1>', tosAccepted: true });
      setZipFile(null);
      mutateSites();
    } catch (err) {
      toast.error(err.message || 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  }

  async function handleDeleteSite(id, name) {
    if (!confirm(`Delete website "${name}"? Files will be removed from node.`)) return;
    try {
      await api.deleteHostingSite(id);
      toast.success('Site deleted');
      mutateSites();
    } catch (err) {
      toast.error(err.message || 'Failed to delete site');
    }
  }

  async function handleAddNode(e) {
    e.preventDefault();
    if (!nodeForm.connection_string.trim()) {
      toast.error('Connection string is required');
      return;
    }

    setAddingNode(true);
    try {
      const res = await api.addHostingNode(nodeForm);
      toast.success(`Node "${res.name}" connected & provisioned!`);
      setShowAddNode(false);
      setNodeForm({ connection_string: '', name: '', public_url: '' });
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Node connection failed');
    } finally {
      setAddingNode(false);
    }
  }

  async function handleBulkAddNodes(e) {
    e.preventDefault();
    if (!bulkNodesText.trim()) {
      toast.error('Please enter at least one SSH connection string');
      return;
    }

    setBulkProvisioning(true);
    setBulkResults(null);
    try {
      const res = await api.addHostingNodesBulk({ connection_strings: bulkNodesText });
      setBulkResults(res);
      mutateNodes();
      if (res.successful > 0) {
        toast.success(`Successfully provisioned ${res.successful} server node(s)!`);
      } else {
        toast.error('Failed to connect to any server nodes.');
      }
    } catch (err) {
      toast.error(err.message || 'Bulk node provisioning failed');
    } finally {
      setBulkProvisioning(false);
    }
  }

  async function handleDeleteNode(id, name) {
    if (!confirm(`Remove node "${name}" from hosting pool?`)) return;
    try {
      await api.deleteHostingNode(id);
      toast.success('Node removed');
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Failed to delete node');
    }
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {t('hosting.eyebrow', 'Build')}
          </>
        }
        title={t('hosting.title', 'Cloud Hosting & Sites')}
        description={t('hosting.subtitle', 'High-performance cloud hosting with automated real-time security scanning and instant subdomains.')}
        actions={
          <>
            {adminUser && (
              <button
                onClick={() => setShowAddNode(true)}
                className="btn-secondary text-xs py-2"
              >
                <PlusIcon className="h-4 w-4" />
                {t('nodes.provision_btn', 'Add server node')}
              </button>
            )}
            <button
              onClick={() => setShowDeploy(true)}
              className="btn-primary text-xs py-2"
            >
              <PlusIcon className="h-4 w-4" />
              {t('hosting.deploy_btn', 'Deploy website')}
            </button>
          </>
        }
        tabs={
          <>
            <PageTab active={tab === 'sites'} onClick={() => setTab('sites')} count={sites.length}>
              <span className="inline-flex items-center gap-1.5">
                <GlobeAltIcon className="h-3.5 w-3.5" />
                {t('hosting.tab_sites', 'Hosted Sites')}
              </span>
            </PageTab>
            <PageTab active={tab === 'plans'} onClick={() => setTab('plans')}>
              <span className="inline-flex items-center gap-1.5">
                <InformationCircleIcon className="h-3.5 w-3.5" />
                {t('hosting.tab_plans', 'Plans & limits')}
              </span>
            </PageTab>
            {adminUser && (
              <PageTab active={tab === 'nodes'} onClick={() => setTab('nodes')} count={nodes.length}>
                <span className="inline-flex items-center gap-1.5">
                  <ServerStackIcon className="h-3.5 w-3.5" />
                  {t('nav.nodes', 'Server Nodes')}
                </span>
              </PageTab>
            )}
            {adminUser && (
              <PageTab active={tab === 'security'} onClick={() => setTab('security')}>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  {t('hosting.tab_security', 'Security audit logs')}
                </span>
              </PageTab>
            )}
          </>
        }
      />

      {/* TAB 1: SITES */}
      {tab === 'sites' && (
        <div>
          {loadingSites ? (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
              <GlobeAltIcon className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{t('hosting.empty_title', 'No sites deployed yet')}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('hosting.empty_desc', 'Deploy your first static website, landing page, or HTML app onto your connected edge server nodes.')}
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setShowDeploy(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t('hosting.deploy_first', 'Deploy First Site')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: t('hosting.stat_sites', 'Hosted sites'),
                    value: sites.length,
                    note: t('hosting.stat_sites_note', '{count} active', { count: activeSites }),
                    icon: GlobeAltIcon,
                    tone: 'text-brand-600 dark:text-brand-400'
                  },
                  {
                    label: t('hosting.stat_visits', 'Visitor hits'),
                    value: totalVisits.toLocaleString(),
                    note: t('hosting.stat_visits_note', 'All time'),
                    icon: ChartBarIcon,
                    tone: 'text-sky-600 dark:text-sky-400'
                  },
                  {
                    label: t('hosting.stat_storage', 'Storage used'),
                    value: storageLabel,
                    note: t('hosting.stat_storage_note', 'Across all sites'),
                    icon: CircleStackIcon,
                    tone: 'text-cf-500 dark:text-slate-400'
                  },
                  {
                    label: t('hosting.stat_security', 'Security status'),
                    value: 'Clean',
                    note: t('hosting.stat_security_note', 'No threats detected'),
                    icon: ShieldCheckIcon,
                    tone: 'text-emerald-600 dark:text-emerald-400'
                  }
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cf-500 dark:text-slate-400">
                          {stat.label}
                        </span>
                        <Icon className={`h-4 w-4 flex-shrink-0 ${stat.tone}`} />
                      </div>
                      <div className="mt-2 font-display text-2xl font-bold leading-none text-cf-ink dark:text-white">
                        {stat.value}
                      </div>
                      <div className="mt-1.5 text-[10px] font-medium text-cf-500 dark:text-slate-400">{stat.note}</div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {sites.map(s => (
                  <div
                    key={s.id}
                    className="card card-hover flex flex-col justify-between p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-base font-bold text-cf-ink dark:text-white">
                            {s.name}
                          </h3>
                          <a
                            href={`http://${s.full_domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 truncate font-mono text-[11px] text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                          >
                            {s.full_domain}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </div>
                        <span className={`badge flex-shrink-0 capitalize ${s.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {s.status}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2.5 border-t border-cf-200 pt-4 text-[11px] text-cf-600 dark:border-cyber-800 dark:text-slate-300">
                        {adminUser && s.node_name && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-cf-500 dark:text-slate-400">{t('hosting.server_node', 'Server node')}</span>
                            <span className="truncate font-mono font-medium text-cf-800 dark:text-slate-200">{s.node_name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-cf-500 dark:text-slate-400">{t('hosting.storage_used', 'Storage used')}</span>
                          <span className="font-mono font-medium text-cf-800 dark:text-slate-200">{(s.storage_used_bytes / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-cf-500 dark:text-slate-400">{t('hosting.visitor_hits', 'Visitor hits')}</span>
                          <span className="font-mono font-medium text-cf-800 dark:text-slate-200">{Number(s.visits_count || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-cf-500 dark:text-slate-400">{t('hosting.security_scan', 'Security scan')}</span>
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                            <ShieldCheckIcon className="h-3.5 w-3.5" />
                            {t('hosting.scan_passed', 'Passed (clean)')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-cf-200 pt-3 dark:border-cyber-800">
                      <a
                        href={`http://${s.full_domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary px-3 py-1.5 text-[11px]"
                      >
                        {t('hosting.visit_live', 'Visit live')}
                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                      </a>
                      <button
                        onClick={() => handleDeleteSite(s.id, s.name)}
                        className="rounded p-1.5 text-cf-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        title={t('hosting.delete_site', 'Delete site')}
                        aria-label={t('hosting.delete_site', 'Delete site')}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NODES (Owner/Admin Only) */}
      {tab === 'nodes' && adminUser && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Connected Server Nodes</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); setShowAddNode(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-600 shadow-sm"
              >
                <ListBulletIcon className="h-3.5 w-3.5 text-brand-500" />
                Bulk Add SSH
              </button>
              <button
                onClick={() => { setNodeModalTab('single'); setBulkResults(null); setShowAddNode(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-medium shadow-sm"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Connect Container
              </button>
            </div>
          </div>

          {loadingNodes ? (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <ServerStackIcon className="h-10 w-10 text-slate-400 mx-auto" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No nodes connected</h3>
              <p className="text-xs text-slate-500 mt-1">Connect your Ubuntu server containers individually or bulk import multiple SSH servers.</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); setShowAddNode(true); }}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600"
                >
                  Bulk Add SSH
                </button>
                <button
                  onClick={() => { setNodeModalTab('single'); setBulkResults(null); setShowAddNode(true); }}
                  className="px-3 py-1.5 bg-brand-700 text-white text-xs font-medium rounded-lg"
                >
                  Connect Single Container
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nodes.map(n => (
                <div key={n.id} className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${n.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{n.name}</h4>
                      </div>
                      <button
                        onClick={() => handleDeleteNode(n.id, n.name)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-500 mt-1">{n.host}:{n.port}</p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="text-slate-400 text-[10px] uppercase">CPUs</div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{n.system_info?.cpus || 1} vCPU</div>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="text-slate-400 text-[10px] uppercase">RAM</div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{formatMemoryMb(n.system_info?.ramTotalMb || n.system_info?.ramMb)}</div>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="text-slate-400 text-[10px] uppercase">Capacity</div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{n.current_sites} / {n.max_sites}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500 flex justify-between items-center">
                    <span>Multi-Site Runner: Active</span>
                    <span className="text-green-600 font-medium">Ready</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PLANS */}
      {tab === 'plans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map(p => {
              const isCurrent = currentPlanName && p.name?.toLowerCase() === currentPlanName.toLowerCase();
              return (
                <div
                  key={p.id}
                  className={`card flex flex-col justify-between p-6 ${isCurrent ? 'ring-1 ring-brand-400/70 dark:ring-brand-500/50' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg font-bold text-cf-ink dark:text-white">{p.name}</h3>
                      {isCurrent && (
                        <span className="badge-brand normal-case tracking-normal">
                          {t('hosting.current_plan', 'Current plan')}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 space-y-2.5 text-xs text-cf-600 dark:text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>{t('hosting.plan_max_sites', 'Max Sites:')}</span>
                        <span className="font-bold text-cf-ink dark:text-white">{p.max_sites}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('hosting.plan_storage', 'Storage Quota:')}</span>
                        <span className="font-bold">{formatMemoryMb(Math.round(p.max_storage_bytes / (1024 * 1024)))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('hosting.plan_max_files', 'Max Files:')}</span>
                        <span className="font-bold">{p.max_files}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('hosting.plan_monthly_req', 'Monthly Requests:')}</span>
                        <span className="font-bold">{p.max_requests_monthly.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('hosting.plan_scanner', 'Anti-Malware Scanner:')}</span>
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                          <ShieldCheckIcon className="h-3.5 w-3.5" />
                          {t('hosting.plan_included', 'Included')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-cf-200 pt-4 dark:border-cyber-800">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cf-400 dark:text-slate-500">
                      {t('hosting.plan_protected', 'Strict Anti-Abuse Protected')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY & ANTI-ABUSE (Owner/Admin Only) */}
      {tab === 'security' && adminUser && (
        <div className="space-y-6">
          <div className="p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
            <h3 className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-amber-600" />
              {t('hosting.security_shield_title', 'Automated Threat Shield & Anti-Abuse Policy')}
            </h3>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              {t('hosting.security_shield_desc', 'To maintain high performance and platform reliability, every deployed site is scanned in real-time before saving to remote disks.')}
            </p>
            <ul className="mt-3 text-xs space-y-1 list-disc list-inside text-amber-700 dark:text-amber-300">
              <li>{t('hosting.security_rule_mining', 'Zero Mining Policy: XMRig, Stratum, CoinHive, and CPU hashing routines are automatically blocked.')}</li>
              <li>{t('hosting.security_rule_phishing', 'Phishing Blocklist: Fake login forms (PayPal, Steam, Discord webhooks, Metamask seed harvesters) are blocked.')}</li>
              <li>{t('hosting.security_rule_webshell', 'Webshell Filter: PHP/Python backdoors (c99, r57, eval(base64), /bin/sh reverse shells) are rejected.')}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{t('hosting.security_logs_title', 'Recent Security Scanner Audit Logs')}</h4>
            {logs.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {t('hosting.security_logs_clean', 'No security violations detected. All deployments are clean.')}
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map(l => (
                  <div key={l.id} className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-xs font-mono flex items-center justify-between">
                    <div>
                      <span className="font-bold text-red-700 dark:text-red-400">[{l.threat_type.toUpperCase()}]</span> {l.file_name} - Threat blocked: {l.matched_pattern}
                    </div>
                    <span className="text-slate-400">{l.created_at}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deploy Site Modal */}
      {showDeploy && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 my-auto max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GlobeAltIcon className="h-5 w-5 text-brand-500" />
                {t('hosting.deploy_title', 'Deploy Website')}
              </h2>
              <button onClick={() => setShowDeploy(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('hosting.site_name_label', 'Site Name (Subdomain)')}
                </label>
                <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
                  <input
                    type="text"
                    required
                    placeholder="myportfolio"
                    value={siteForm.name}
                    onChange={e => setSiteForm({ ...siteForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 px-3 py-2 bg-transparent text-sm outline-none font-mono"
                  />
                  <span className="px-3 py-2 bg-slate-50 dark:bg-slate-700 text-xs font-mono text-slate-500 border-l border-slate-300 dark:border-slate-600 flex items-center">
                    .{hostingBaseDomain || 'configure-domain'}
                  </span>
                </div>
              </div>

              {/* Mode switch */}
              <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setDeployMode('html')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${deployMode === 'html' ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 font-bold' : 'text-slate-500'}`}
                >
                  {t('hosting.deploy_type_html', 'HTML Code Editor')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeployMode('zip')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${deployMode === 'zip' ? 'bg-white dark:bg-slate-800 shadow-sm text-brand-600 font-bold' : 'text-slate-500'}`}
                >
                  {t('hosting.deploy_type_zip', 'Upload ZIP Archive')}
                </button>
              </div>

              {deployMode === 'html' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('hosting.html_content_label', 'HTML Code (index.html)')}
                  </label>
                  <textarea
                    rows={6}
                    value={siteForm.rawHtml}
                    onChange={e => setSiteForm({ ...siteForm, rawHtml: e.target.value })}
                    className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('hosting.upload_zip_label', 'Select ZIP File')}
                  </label>
                  <input
                    type="file"
                    accept=".zip"
                    required
                    onChange={e => setZipFile(e.target.files[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Must contain an index.html at root.</p>
                </div>
              )}

              <div className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  id="tos"
                  required
                  checked={siteForm.tosAccepted}
                  onChange={e => setSiteForm({ ...siteForm, tosAccepted: e.target.checked })}
                  className="rounded border-slate-300 text-brand-600 mt-0.5"
                />
                <label htmlFor="tos" className="text-xs text-slate-600 dark:text-slate-300 select-none cursor-pointer">
                  I agree to the <b>Anti-Abuse Policy</b> (No cryptocurrency miners, phishing login kits, webshells, or malware).
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowDeploy(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={deploying}
                  className="px-4 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                >
                  {deploying ? t('hosting.deploying_btn', 'Scanning & Deploying...') : t('hosting.deploy_now_btn', 'Deploy to Cloud')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Portal>
      )}

      {/* Add Node Modal (Owner/Admin Only) */}
      {showAddNode && adminUser && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 my-auto max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ServerStackIcon className="h-5 w-5 text-brand-500" />
                {t('nodes.add_title', 'Add Hosting Node')}
              </h2>
              <button onClick={() => { setShowAddNode(false); setBulkResults(null); }} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs: Single vs Bulk */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 mt-3">
              <button
                type="button"
                onClick={() => { setNodeModalTab('single'); setBulkResults(null); }}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                  nodeModalTab === 'single'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                {t('nodes.single_node_enroll', 'Single Node')}
              </button>
              <button
                type="button"
                onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); }}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  nodeModalTab === 'bulk'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <ListBulletIcon className="h-3.5 w-3.5" />
                {t('nodes.bulk_ssh_import', 'Bulk SSH Import')}
              </button>
            </div>

            {nodeModalTab === 'single' ? (
              <form onSubmit={handleAddNode} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Connection String (host:port:user:pass)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="198.51.100.25:22:root:password"
                    value={nodeForm.connection_string}
                    onChange={e => setNodeForm({ ...nodeForm, connection_string: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white outline-none font-mono"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Provide your Ubuntu container SSH host, port, username, and password.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Node Friendly Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="edge-node-01"
                    value={nodeForm.name}
                    onChange={e => setNodeForm({ ...nodeForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm outline-none"
                  />
                </div>

                <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-lg text-xs text-brand-700 dark:text-brand-300 space-y-1">
                  <p className="font-semibold">⚡ Automated Provisioning:</p>
                  <p>The system will automatically SSH into this container, set up directories, launch the multi-site web runner, and connect it to the hosting cluster.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowAddNode(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingNode}
                    className="px-4 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {addingNode ? 'Connecting & Provisioning...' : 'Connect Server Node'}
                  </button>
                </div>
              </form>
            ) : bulkResults ? (
              <div className="space-y-4 mt-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-white">Bulk Provisioning Complete</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {bulkResults.total} node(s) processed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                        {bulkResults.successful} Online
                      </span>
                      {bulkResults.failed > 0 && (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                          {bulkResults.failed} Failed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {bulkResults.results.map((r, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-xs border ${
                        r.status === 'success'
                          ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5 font-mono font-medium text-slate-900 dark:text-white">
                          {r.status === 'success' ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <ExclamationCircleIcon className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          <span>{r.host ? `${r.host}:${r.port}` : r.input}</span>
                        </div>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            r.status === 'success'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      {r.status === 'success' ? (
                        <div className="mt-1 text-slate-600 dark:text-slate-300 pl-5">
                          Node: <span className="font-semibold">{r.node?.name || r.name}</span> • {r.node?.system_info?.cpus || 1} vCPU • {formatMemoryMb(r.node?.system_info?.ramTotalMb || r.node?.system_info?.ramMb)} RAM
                        </div>
                      ) : (
                        <div className="mt-1 text-red-600 dark:text-red-400 pl-5 font-sans">
                          {r.error || 'Connection failed'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => { setBulkResults(null); setBulkNodesText(''); }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    Import More
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddNode(false); setBulkResults(null); }}
                    className="px-4 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-lg shadow-sm"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBulkAddNodes} className="space-y-4 mt-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      SSH Connection Strings (One per line)
                    </label>
                    <span className="text-[11px] text-brand-600 dark:text-brand-400 font-mono font-medium">
                      {bulkNodesText.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes(':')).length} nodes detected
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    required
                    placeholder={`198.51.100.25:22:root:password123 # US-Edge-1\n198.51.100.26:22:root:password456 # US-Edge-2\nubuntu:mypass@198.51.100.27:2222\n10.0.0.15:22:root:secret`}
                    value={bulkNodesText}
                    onChange={e => setBulkNodesText(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Format: <code>host:port:user:pass</code> or <code>user:pass@host:port</code>. Append <code># Custom Name</code> to name each node.
                  </p>
                </div>

                <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-lg text-xs text-brand-700 dark:text-brand-300 space-y-1">
                  <p className="font-semibold">⚡ Parallel Provisioning (Pool size 3):</p>
                  <p>All nodes will be contacted simultaneously via SSH, verified, hardware specs collected, and integrated into the cluster.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowAddNode(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkProvisioning}
                    className="px-4 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {bulkProvisioning ? 'Provisioning In Bulk...' : 'Connect & Provision Bulk'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </Portal>
      )}
    </div>
  );
}
