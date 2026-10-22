'use strict';
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
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
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

export default function ApplicationsPage() {
  const { data: appsData, isLoading, mutate } = useSWR('apps-list', () => api.getApplications());
  const { data: nodesData } = useSWR('apps-nodes', () => api.getHostingNodes());
  const { data: subsData } = useSWR('apps-subs', () => api.getSubdomains({ limit: 100 }));

  const applications = appsData?.applications || [];
  const nodes = nodesData?.nodes || [];
  const subdomains = subsData?.subdomains || [];

  // Modal state
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
    port: 3000,
    env_vars: '{\n  "NODE_ENV": "production",\n  "PORT": "3000"\n}'
  });

  // Action states
  const [deployingId, setDeployingId] = useState(null);
  const [inspectApp, setInspectApp] = useState(null);
  const [activeLogs, setActiveLogs] = useState(null);
  const [controllingId, setControllingId] = useState(null);

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
        port: parseInt(form.port, 10) || 3000,
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
        port: 3000,
        env_vars: '{\n  "NODE_ENV": "production",\n  "PORT": "3000"\n}'
      });
      mutate();
    } catch (err) {
      toast.error(err.message || 'Failed to create application');
    } finally {
      setCreating(false);
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
      toast.success(`Application ${action}ed`);
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
    } catch (err) {
      toast.error(err.message || 'Failed to delete application');
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <CommandLineIcon className="w-8 h-8 text-indigo-600 dark:text-cyan-400" />
            <span>Applications &amp; Deployments</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage Git-backed developer services, environment variables, deployment tasks, and port mappings.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 self-start shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Application</span>
        </button>
      </div>

      {/* Applications Grid */}
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
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
            📦
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">No applications deployed yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create an application to pull from your Git repository, inject encrypted environment secrets, and map it directly to a custom subdomain.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary py-2 px-5 text-xs font-semibold"
          >
            Create Your First App
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map((app) => (
            <div key={app.id} className="card p-5 space-y-4 hover:border-indigo-300 dark:hover:border-cyber-700 transition-colors flex flex-col justify-between">
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
                    <span className="font-bold text-indigo-600 dark:text-cyan-400">{app.port}</span>
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
                        className="text-cyan-600 dark:text-cyan-400 hover:underline truncate max-w-[170px]"
                      >
                        {app.subdomain.full_domain} ↗
                      </a>
                    </div>
                  )}
                </div>

                {/* Latest Release */}
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

      {/* Create Application Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <CommandLineIcon className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
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
                    placeholder="3000"
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
                  <DocumentTextIcon className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
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
    </div>
  );
}
