'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { isAdmin } from '../../../lib/auth';
import { formatTimeAgo } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import CommandorLaunchpad from '../../../components/CommandorLaunchpad';
import SubdomainTemplates from '../../../components/SubdomainTemplates';
import PageHeader, { PageTab } from '../../../components/PageHeader';
import {
  CommandLineIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  GlobeAltIcon,
  ServerStackIcon,
  DocumentTextIcon,
  XMarkIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  ClockIcon,
  Square3Stack3DIcon
} from '@heroicons/react/24/outline';

// Keep this in sync with appRunnerService.DEFAULT_APP_PORT. The API and
// dashboard ports are rejected by the backend, so new apps should not default
// to them.
const DEFAULT_APP_PORT = 8080;

export default function ApplicationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('apps'); // 'apps' | 'templates'
  const [adminUser, setAdminUser] = useState(false);
  const { data: appsData, isLoading, mutate } = useSWR('apps-list', () => api.getApplications());
  const { data: nodesData } = useSWR(adminUser ? 'apps-nodes' : null, () => api.getHostingNodes());
  const { data: subsData } = useSWR('apps-subs', () => api.getSubdomains({ limit: 100 }));

  useEffect(() => {
    setAdminUser(isAdmin());
  }, []);

  const applications = appsData?.applications || [];
  const nodes = nodesData?.nodes || [];
  const subdomains = subsData?.subdomains || [];

  // Launchpad Modal state
  const [showLaunchpad, setShowLaunchpad] = useState(false);
  const [launchpadTemplate, setLaunchpadTemplate] = useState(null);

  // Manual Create Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    node_id: '',
    subdomain_id: '',
    git_repo: '',
    git_branch: 'main',
    build_command: 'npm install && npm run build',
    start_command: 'npm start',
    port: DEFAULT_APP_PORT,
    env_vars: `{\n  "NODE_ENV": "production",\n  "PORT": "${DEFAULT_APP_PORT}"\n}`
  });

  // Action states
  const [deployingId, setDeployingId] = useState(null);
  const [inspectApp, setInspectApp] = useState(null);
  const [activeLogs, setActiveLogs] = useState(null);
  const [runtimeLogs, setRuntimeLogs] = useState(null);
  const [loadingRuntimeLogs, setLoadingRuntimeLogs] = useState(false);
  const [controllingId, setControllingId] = useState(null);

  // Deployment History & Rollback Modal state
  const [historyApp, setHistoryApp] = useState(null);
  const [deploymentsList, setDeploymentsList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);

  async function handleOpenHistory(app) {
    setHistoryApp(app);
    setLoadingHistory(true);
    try {
      const res = await api.getApplicationDeployments(app.id);
      setDeploymentsList(res.deployments || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load deployment history');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleRollback(deploymentId, commitHash) {
    if (!confirm(`Are you sure you want to rollback to release commit ${commitHash}? A post-rollback health probe will be executed.`)) {
      return;
    }
    setRollingBackId(deploymentId);
    try {
      const res = await api.rollbackApplication(historyApp.id, deploymentId);
      if (res.healthy) {
        toast.success(`Rolled back and verified healthy: ${res.rollbackCommit}`);
      } else {
        toast.error(`Rolled back but health check failed: ${res.message}`);
      }
      // Refresh history list and applications
      const refreshed = await api.getApplicationDeployments(historyApp.id);
      setDeploymentsList(refreshed.deployments || []);
      mutate();
    } catch (err) {
      toast.error(err.message || 'Rollback operation failed');
    } finally {
      setRollingBackId(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.git_repo.trim()) {
      toast.error('Application name and Git repository are required');
      return;
    }

    setCreating(true);
    try {
      let parsedEnv = {};
      if (form.env_vars && form.env_vars.trim()) {
        try {
          parsedEnv = JSON.parse(form.env_vars);
        } catch {
          toast.error('Environment variables must be valid JSON');
          setCreating(false);
          return;
        }
      }

      await api.createApplication({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        node_id: form.node_id ? parseInt(form.node_id, 10) : undefined,
        subdomain_id: form.subdomain_id ? parseInt(form.subdomain_id, 10) : undefined,
        git_repo: form.git_repo.trim(),
        git_branch: form.git_branch.trim() || 'main',
        build_command: form.build_command.trim() || undefined,
        start_command: form.start_command.trim() || undefined,
        port: parseInt(form.port, 10) || DEFAULT_APP_PORT,
        env_vars: parsedEnv
      });

      toast.success(`Application "${form.name}" created!`);
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        node_id: '',
        subdomain_id: '',
        git_repo: '',
        git_branch: 'main',
        build_command: 'npm install && npm run build',
        start_command: 'npm start',
        port: DEFAULT_APP_PORT,
        env_vars: `{\n  "NODE_ENV": "production",\n  "PORT": "${DEFAULT_APP_PORT}"\n}`
      });
      mutate();
    } catch (err) {
      toast.error(err.message || 'Failed to create application');
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenRuntimeLogs(app) {
    setLoadingRuntimeLogs(true);
    setRuntimeLogs({ appName: app.name, content: '', logFile: null });
    try {
      const res = await api.getApplicationLogs(app.id);
      setRuntimeLogs({
        appName: app.name,
        content: res?.content || 'No runtime output has been captured yet.',
        logFile: res?.logFile || null
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load runtime logs');
      setRuntimeLogs(null);
    } finally {
      setLoadingRuntimeLogs(false);
    }
  }

  async function handleDeploy(id, name) {
    setDeployingId(id);
    try {
      const res = await api.deployApplication(id);
      if (res.status === 'success') {
        toast.success(`Application "${name}" deployed successfully!`);
      } else {
        toast.error(`Deployment failed: ${res.logs?.slice(-100) || 'Unknown error'}`);
      }
      setActiveLogs({
        appName: name,
        commit: res.commitHash,
        logs: res.logs,
        status: res.status
      });
      mutate();
    } catch (err) {
      toast.error(err.message || 'Deploy trigger failed');
    } finally {
      setDeployingId(null);
    }
  }

  async function handleControl(id, action) {
    setControllingId(`${id}-${action}`);
    try {
      await api.controlApplication(id, action);
      const pastTense = action === 'stop' ? 'stopped' : action === 'start' ? 'started' : action === 'restart' ? 'restarted' : action;
      toast.success(`Application ${pastTense}`);
      mutate();
    } catch (err) {
      toast.error(err.message || `Failed to ${action} application`);
    } finally {
      setControllingId(null);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Are you sure you want to delete application "${name}"?`)) return;
    try {
      await api.deleteApplication(id);
      toast.success(`Application "${name}" deleted`);
      mutate();
      if (inspectApp?.id === id) setInspectApp(null);
      if (historyApp?.id === id) setHistoryApp(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete application');
    }
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {t('apps.eyebrow', 'Build')}
          </>
        }
        title={t('apps.title', 'Applications & Deployments')}
        description={t('apps.subtitle', 'Git-backed developer services, automated reverse-proxy ingress, release history, and rollback engine.')}
        actions={
          <>
            <button
              onClick={() => {
                setLaunchpadTemplate(null);
                setShowLaunchpad(true);
              }}
              className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-md"
            >
              <RocketLaunchIcon className="w-4 h-4" />
              <span>{t('launchpad.title', 'Commandor Launchpad')}</span>
            </button>

            <button
              onClick={() => setShowCreate(true)}
              className="btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{t('apps.deploy_btn', 'Deploy application')}</span>
            </button>
          </>
        }
        tabs={
          <>
            <PageTab active={activeTab === 'apps'} onClick={() => setActiveTab('apps')} count={applications.length}>
              <span className="inline-flex items-center gap-1.5">
                <CommandLineIcon className="h-3.5 w-3.5" />
                {t('apps.running_apps', 'Active applications')}
              </span>
            </PageTab>
            <PageTab active={activeTab === 'templates'} onClick={() => setActiveTab('templates')}>
              <span className="inline-flex items-center gap-1.5">
                <Square3Stack3DIcon className="h-3.5 w-3.5" />
                {t('templates.title', 'Service Blueprints & Templates')}
              </span>
            </PageTab>
          </>
        }
      />

      {/* TAB CONTENT: TEMPLATES */}
      {activeTab === 'templates' && (
        <SubdomainTemplates
          onSelectTemplateForLaunch={(tpl) => {
            setLaunchpadTemplate(tpl);
            setShowLaunchpad(true);
          }}
        />
      )}

      {/* TAB CONTENT: APPLICATIONS GRID */}
      {activeTab === 'apps' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-5 animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 dark:bg-cyber-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : applications.length === 0 ? (
            <div className="card p-12 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-brand-100 dark:border-cyber-800">
                🚀
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">{t('apps.empty_title', 'No applications deployed yet')}</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {t('apps.empty_desc', 'Use the Commandor Launchpad to guide you through creating a Git repository service, mapping it to a custom subdomain, and deploying with zero downtime.')}
              </p>
              <button
                onClick={() => {
                  setLaunchpadTemplate(null);
                  setShowLaunchpad(true);
                }}
                className="btn-primary py-2.5 px-6 text-xs font-semibold shadow-md inline-flex items-center gap-2"
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span>{t('apps.open_launchpad', 'Open Commandor Launchpad')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {applications.map((app) => (
                <div key={app.id} className="card p-5 space-y-4 hover:border-brand-300 dark:hover:border-cyber-700 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            app.status === 'running' ? 'bg-emerald-500 animate-pulse' :
                            app.status === 'deploying' ? 'bg-amber-500 animate-spin' :
                            app.status === 'failed' ? 'bg-rose-500' : 'bg-slate-400'
                          }`} />
                          <h3 className="font-bold text-base text-slate-900 dark:text-white">{app.name}</h3>
                        </div>
                        {app.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{app.description}</p>
                        )}
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase ${
                        app.status === 'running' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                        app.status === 'deploying' ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800' :
                        app.status === 'failed' ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800' :
                        'bg-slate-100 dark:bg-cyber-850 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-cyber-800'
                      }`}>
                        {app.status}
                      </span>
                    </div>

                    {/* Specs Box */}
                    <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200/70 dark:border-cyber-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        <span>Git:</span>
                        <span className="truncate max-w-[180px] text-slate-900 dark:text-slate-200" title={app.git_repo}>
                          {app.git_repo.split('/').slice(-2).join('/')}#{app.git_branch}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        <span>Port:</span>
                        <span className="font-bold text-brand-600 dark:text-sky-400">{app.port}</span>
                      </div>

                      {app.node && (
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          <span>Node:</span>
                          <span className="text-slate-800 dark:text-slate-200">{app.node.name}</span>
                        </div>
                      )}

                      {app.subdomain && (
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          <span>Subdomain:</span>
                          <a
                            href={`https://${app.subdomain.full_domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[170px]"
                          >
                            {app.subdomain.full_domain} ↗
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Latest Release & Health Summary */}
                    {app.latestDeployment && (
                      <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Release: <code className="text-slate-700 dark:text-slate-300 font-bold">{app.latestDeployment.commit_hash}</code></span>
                        <span>{formatTimeAgo(app.latestDeployment.created_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-slate-100 dark:border-cyber-800 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {app.status === 'running' ? (
                        <button
                          onClick={() => handleControl(app.id, 'stop')}
                          disabled={controllingId === `${app.id}-stop`}
                          title="Stop application"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-cyber-800 hover:bg-slate-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300 text-xs"
                        >
                          <StopIcon className="w-4 h-4 text-amber-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleControl(app.id, 'start')}
                          disabled={controllingId === `${app.id}-start`}
                          title="Start application"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-cyber-800 hover:bg-slate-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300 text-xs"
                        >
                          <PlayIcon className="w-4 h-4 text-emerald-500" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeploy(app.id, app.name)}
                        disabled={deployingId === app.id}
                        title="Trigger Build & Deploy"
                        className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1"
                      >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${deployingId === app.id ? 'animate-spin' : ''}`} />
                        <span>Deploy</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Deployment History & Rollback Button */}
                      <button
                        onClick={() => handleOpenHistory(app)}
                        title="Deployment History & Safe Rollback"
                        className="p-1.5 rounded-lg border border-brand-200 dark:border-brand-900/60 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-brand-600 dark:text-sky-400 text-xs flex items-center gap-1"
                      >
                        <ClockIcon className="w-4 h-4" />
                        <span className="hidden sm:inline font-semibold text-[11px]">Releases</span>
                      </button>

                      <button
                        onClick={() => handleOpenRuntimeLogs(app)}
                        disabled={loadingRuntimeLogs}
                        title="Runtime process logs"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-cyber-800 hover:bg-slate-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300 text-xs"
                      >
                        <CommandLineIcon className="w-4 h-4 text-emerald-500" />
                      </button>

                      <button
                        onClick={() => {
                          setInspectApp(app);
                          setActiveLogs(app.latestDeployment ? {
                            appName: app.name,
                            commit: app.latestDeployment.commit_hash,
                            logs: app.latestDeployment.logs || 'No deployment logs stored yet.',
                            status: app.latestDeployment.status
                          } : null);
                        }}
                        title="Inspect & Logs"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-cyber-800 hover:bg-slate-100 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300 text-xs"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(app.id, app.name)}
                        title="Delete application"
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Commandor Launchpad Wizard Modal */}
      <CommandorLaunchpad
        isOpen={showLaunchpad}
        onClose={() => setShowLaunchpad(false)}
        initialTemplate={launchpadTemplate}
        onWorkflowCompleted={() => {
          mutate();
        }}
      />

      {/* DEPLOYMENT HISTORY & ROLLBACK MODAL */}
      {historyApp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-3xl w-full p-6 space-y-5 max-h-[88vh] flex flex-col border-brand-300 dark:border-cyber-700 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-brand-600 dark:text-sky-400" />
                  <span>Deployment History &amp; Rollback — {historyApp.name}</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Inspect commit logs, probe health outcomes, and safely rollback to prior verified releases.
                </p>
              </div>
              <button onClick={() => setHistoryApp(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs pr-1">
              {loadingHistory ? (
                <div className="p-8 text-center text-slate-400 font-mono animate-pulse">
                  Loading deployment releases...
                </div>
              ) : deploymentsList.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No deployment history records found for this service.
                </div>
              ) : (
                deploymentsList.map((dep, idx) => (
                  <div
                    key={dep.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-cyber-800 bg-slate-50 dark:bg-cyber-900 space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                          dep.status === 'success'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-300'
                            : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}>
                          {dep.status}
                        </span>

                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          Release {dep.commit_hash}
                        </span>

                        {dep.is_rollback === 1 && (
                          <span className="badge-amber text-[10px] font-mono flex items-center gap-1">
                            <ArrowUturnLeftIcon className="w-3 h-3" /> Rollback Release
                          </span>
                        )}

                        {idx === 0 && (
                          <span className="badge-cyan text-[10px] font-mono font-bold">
                            Current Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span>Duration: {dep.duration_ms}ms</span>
                        <span>{formatTimeAgo(dep.created_at)}</span>
                      </div>
                    </div>

                    {/* Health Check Results */}
                    {dep.health_check_result && (
                      <div className={`p-2.5 rounded-lg border text-[11px] font-mono flex items-center justify-between ${
                        dep.health_check_result.healthy
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {dep.health_check_result.healthy ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <ExclamationCircleIcon className="w-4 h-4 text-rose-500 flex-shrink-0" />
                          )}
                          <span>
                            Health Check: {dep.health_check_result.healthy ? 'PASSED (200 OK)' : `FAILED (${dep.health_check_result.error || 'Status ' + dep.health_check_result.statusCode})`}
                          </span>
                        </div>
                        <span className="text-[10px] opacity-80">{dep.health_check_result.endpoint}</span>
                      </div>
                    )}

                    {/* Actions & Rollback */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-cyber-800">
                      <button
                        onClick={() => {
                          setActiveLogs({
                            appName: historyApp.name,
                            commit: dep.commit_hash,
                            logs: dep.logs || 'No log body captured.',
                            status: dep.status
                          });
                        }}
                        className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
                      >
                        <DocumentTextIcon className="w-3.5 h-3.5" />
                        <span>View Build Logs</span>
                      </button>

                      {idx !== 0 && (
                        <button
                          onClick={() => handleRollback(dep.id, dep.commit_hash)}
                          disabled={rollingBackId === dep.id}
                          className="btn-primary py-1 px-3 text-xs flex items-center gap-1 font-semibold"
                        >
                          <ArrowUturnLeftIcon className={`w-3.5 h-3.5 ${rollingBackId === dep.id ? 'animate-spin' : ''}`} />
                          <span>{rollingBackId === dep.id ? 'Rolling back...' : 'Rollback to this Release'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-cyber-800">
              <button
                onClick={() => setHistoryApp(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Create Application Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <CommandLineIcon className="w-5 h-5 text-brand-600 dark:text-sky-400" />
                <span>Deploy New Application</span>
              </h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Application Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. auth-api"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-cyber w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Internal Port *</label>
                  <input
                    type="number"
                    required
                    placeholder={String(DEFAULT_APP_PORT)}
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    className="input-cyber w-full font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Git Repository URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/myorg/repo.git"
                  value={form.git_repo}
                  onChange={(e) => setForm({ ...form, git_repo: e.target.value })}
                  className="input-cyber w-full font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Branch</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={form.git_branch}
                    onChange={(e) => setForm({ ...form, git_branch: e.target.value })}
                    className="input-cyber w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Cluster Node (Target)</label>
                  <select
                    value={form.node_id}
                    onChange={(e) => setForm({ ...form, node_id: e.target.value })}
                    className="input-cyber w-full"
                  >
                    <option value="">Local Server (Default)</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.host})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Map to Subdomain (Optional)</label>
                <select
                  value={form.subdomain_id}
                  onChange={(e) => setForm({ ...form, subdomain_id: e.target.value })}
                  className="input-cyber w-full font-mono"
                >
                  <option value="">None (Port Access Only)</option>
                  {subdomains.map(s => (
                    <option key={s.id} value={s.id}>{s.full_domain}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Build Command</label>
                  <input
                    type="text"
                    placeholder="npm install && npm run build"
                    value={form.build_command}
                    onChange={(e) => setForm({ ...form, build_command: e.target.value })}
                    className="input-cyber w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Start Command</label>
                  <input
                    type="text"
                    placeholder="npm start"
                    value={form.start_command}
                    onChange={(e) => setForm({ ...form, start_command: e.target.value })}
                    className="input-cyber w-full font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 flex items-center justify-between">
                  <span>Environment Secrets (JSON format)</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-normal">Encrypted with AES-256</span>
                </label>
                <textarea
                  rows={4}
                  value={form.env_vars}
                  onChange={(e) => setForm({ ...form, env_vars: e.target.value })}
                  className="input-cyber w-full font-mono text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-cyber-800">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary py-1.5 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary py-2 px-5 font-semibold"
                >
                  {creating ? 'Creating Application...' : 'Create Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect & Logs Modal */}
      {activeLogs && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-brand-600 dark:text-sky-400" />
                  <span>Deployment Logs — {activeLogs.appName}</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Release Commit: {activeLogs.commit}</p>
              </div>
              <button onClick={() => setActiveLogs(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <pre className="flex-1 bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
              {activeLogs.logs}
            </pre>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-cyber-800">
              <button
                onClick={() => setActiveLogs(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Runtime Process Logs Modal */}
      {runtimeLogs && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <CommandLineIcon className="w-5 h-5 text-emerald-500" />
                  <span>Runtime Logs — {runtimeLogs.appName}</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5 break-all">
                  {runtimeLogs.logFile || 'Local runner log'}
                </p>
              </div>
              <button onClick={() => setRuntimeLogs(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <pre className="flex-1 bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800 min-h-[200px]">
              {loadingRuntimeLogs ? 'Loading runtime output...' : runtimeLogs.content}
            </pre>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-cyber-800">
              <span className="text-[11px] text-slate-400">
                Runtime logs are captured from the application process on this host.
              </span>
              <button
                onClick={() => setRuntimeLogs(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
