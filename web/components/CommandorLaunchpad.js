'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useTranslation } from '../lib/i18n';
import {
  RocketLaunchIcon,
  CommandLineIcon,
  ServerStackIcon,
  GlobeAltIcon,
  KeyIcon,
  ShieldCheckIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

const STEPS = [
  { num: 1, title: 'Source', desc: 'Git Repo / Service' },
  { num: 2, title: 'Node', desc: 'Compute Cluster' },
  { num: 3, title: 'Runtime', desc: 'Build & Ports' },
  { num: 4, title: 'Secrets', desc: 'Encrypted Env' },
  { num: 5, title: 'Routing', desc: 'Domain / Subdomain' },
  { num: 6, title: 'Preview', desc: 'DNS & Proxy VHost' },
  { num: 7, title: 'Confirm', desc: 'Review Plan' },
  { num: 8, title: 'Deploy', desc: 'Controlled Job' },
  { num: 9, title: 'Health', desc: 'Endpoint Probe' },
  { num: 10, title: 'Live', desc: 'Status & Recovery' }
];

export default function CommandorLaunchpad({ isOpen, onClose, initialTemplate = null, onWorkflowCompleted }) {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(1);
  const [workflowId, setWorkflowId] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [workflowState, setWorkflowState] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState('application');
  const [templateKey, setTemplateKey] = useState(initialTemplate?.template_key || '');

  // Step 1: Source
  const [gitRepo, setGitRepo] = useState('https://github.com/myorg/api-service.git');
  const [gitBranch, setGitBranch] = useState('main');

  // Step 2: Node
  const [selectedNodeId, setSelectedNodeId] = useState('');

  // Step 3: Runtime
  const [runtime, setRuntime] = useState(initialTemplate?.runtime || 'nodejs');
  const [buildCommand, setBuildCommand] = useState(initialTemplate?.recommended_build || 'npm ci && npm run build');
  const [startCommand, setStartCommand] = useState(initialTemplate?.recommended_start || 'npm start');
  const [port, setPort] = useState(initialTemplate?.default_port || 3000);
  const [healthCheckPath, setHealthCheckPath] = useState(initialTemplate?.health_check_endpoint || '/health');

  // Step 4: Secrets
  const [envVars, setEnvVars] = useState(
    initialTemplate?.default_env ? JSON.stringify(initialTemplate.default_env, null, 2) : '{\n  "NODE_ENV": "production"\n}'
  );

  // Step 5: Domain
  const [subdomain, setSubdomain] = useState('');
  const [baseDomain, setBaseDomain] = useState('commandor.my.id');
  const [enableHttps, setEnableHttps] = useState(true);

  // Step 6: Preview
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 7: Confirmation
  const [confirmed, setConfirmed] = useState(false);

  // Fetch Nodes & Domains
  const { data: nodesData } = useSWR(isOpen ? 'launchpad-nodes' : null, () => api.getHostingNodes());
  const { data: domainsData } = useSWR(isOpen ? 'launchpad-domains' : null, () => api.getDomainList());
  const { data: basesData } = useSWR(isOpen ? 'launchpad-bases' : null, () => api.getSubdomainBases());

  const nodes = nodesData?.nodes || [];
  const customDomains = Array.isArray(domainsData) ? domainsData : [];
  const baseDomains = basesData?.baseDomains || ['commandor.my.id'];
  const allDomains = Array.from(new Set([...baseDomains, ...customDomains.map(d => d.domain)]));

  // Initialize from initialTemplate if provided
  useEffect(() => {
    if (initialTemplate) {
      setTemplateKey(initialTemplate.template_key);
      setRuntime(initialTemplate.runtime || 'nodejs');
      setBuildCommand(initialTemplate.recommended_build || '');
      setStartCommand(initialTemplate.recommended_start || '');
      setPort(initialTemplate.default_port || 3000);
      setHealthCheckPath(initialTemplate.health_check_endpoint || '/health');
      if (initialTemplate.default_env) {
        setEnvVars(JSON.stringify(initialTemplate.default_env, null, 2));
      }
      if (!name) {
        setName(`${initialTemplate.template_key}-app`);
        setSubdomain(initialTemplate.template_key.replace(/[^a-z0-9]/g, '-'));
      }
    }
  }, [initialTemplate]);

  // Handle Step Advancement & Sync
  async function handleNextStep() {
    try {
      let wfId = workflowId;
      if (!wfId) {
        if (!name.trim()) {
          toast.error('Please enter a service name.');
          return;
        }
        const created = await api.createLaunchpadWorkflow({
          name: name.trim(),
          service_type: serviceType,
          template_key: templateKey || null
        });
        wfId = created.id;
        setWorkflowId(wfId);
      }

      if (activeStep === 1) {
        if (!gitRepo.trim()) {
          toast.error('Git repository URL is required');
          return;
        }
        await api.updateLaunchpadStep(wfId, 1, { git_repo: gitRepo.trim(), git_branch: gitBranch.trim() });
      } else if (activeStep === 2) {
        const node = nodes.find(n => String(n.id) === String(selectedNodeId));
        await api.updateLaunchpadStep(wfId, 2, {
          node_id: selectedNodeId ? parseInt(selectedNodeId, 10) : null,
          node_name: node?.name || 'Local Host Node'
        });
      } else if (activeStep === 3) {
        await api.updateLaunchpadStep(wfId, 3, {
          runtime,
          build_command: buildCommand,
          start_command: startCommand,
          port: parseInt(port, 10) || 3000,
          health_check_path: healthCheckPath
        });
      } else if (activeStep === 4) {
        let parsed = {};
        try {
          parsed = JSON.parse(envVars || '{}');
        } catch {
          toast.error('Environment variables must be valid JSON');
          return;
        }
        await api.updateLaunchpadStep(wfId, 4, { env_vars: parsed });
      } else if (activeStep === 5) {
        if (!subdomain.trim()) {
          toast.error('Subdomain is required');
          return;
        }
        await api.updateLaunchpadStep(wfId, 5, {
          subdomain: subdomain.trim(),
          base_domain: baseDomain.trim(),
          enable_https: enableHttps
        });

        // Trigger Step 6 Preview
        setLoadingPreview(true);
        const updated = await api.updateLaunchpadStep(wfId, 6, {});
        setPreviewData(updated.workflow_data?.step6_preview);
        setLoadingPreview(false);
      } else if (activeStep === 6) {
        // Advanced to review step
      } else if (activeStep === 7) {
        if (!confirmed) {
          toast.error('Please check the confirmation box to verify the plan.');
          return;
        }
        await api.updateLaunchpadStep(wfId, 7, { confirmed: true });
        // Trigger execution (Steps 8-10)
        executeDeployment(wfId);
      }

      setActiveStep(prev => Math.min(10, prev + 1));
    } catch (err) {
      toast.error(err.message || 'Validation error');
    }
  }

  async function executeDeployment(wfId) {
    setExecuting(true);
    try {
      const res = await api.executeLaunchpadWorkflow(wfId);
      setWorkflowState(res);
      if (res.status === 'completed') {
        toast.success(`Service "${name}" successfully deployed and healthy!`);
        if (onWorkflowCompleted) onWorkflowCompleted(res);
      } else {
        toast.error(`Deployment finished with warnings: ${res.error_message || 'Health check failed'}`);
      }
    } catch (err) {
      toast.error(err.message || 'Deployment execution halted');
    } finally {
      setExecuting(false);
    }
  }

  async function handleResumeWorkflow() {
    if (!workflowId) return;
    setExecuting(true);
    try {
      const res = await api.resumeLaunchpadWorkflow(workflowId);
      setWorkflowState(res);
      if (res.status === 'completed') {
        toast.success(`Resumed and passed health probe!`);
        if (onWorkflowCompleted) onWorkflowCompleted(res);
      } else {
        toast.error(`Resume attempt finished with status: ${res.status}`);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to resume workflow');
    } finally {
      setExecuting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="card max-w-4xl w-full p-5 sm:p-7 space-y-6 max-h-[92vh] flex flex-col border-indigo-300 dark:border-cyber-700 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md">
              <RocketLaunchIcon className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Commandor Launchpad</span>
                <span className="badge-cyan text-[10px] uppercase font-mono">10-Step Guided Engine</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                End-to-end service creation: Git source, node allocation, secrets, Nginx reverse proxy, DNS, TLS, health probe, and auto-recovery.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* 10-Step Wizard Tracker */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 py-1 text-center font-mono text-[10px]">
          {STEPS.map((s) => {
            const isCompleted = activeStep > s.num || workflowState?.status === 'completed';
            const isCurrent = activeStep === s.num;
            return (
              <div
                key={s.num}
                className={`p-1.5 rounded-lg border transition-all ${
                  isCurrent
                    ? 'border-indigo-600 dark:border-cyan-400 bg-indigo-50 dark:bg-cyan-950/60 font-bold text-indigo-700 dark:text-cyan-300'
                    : isCompleted
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-cyber-800 text-slate-400 opacity-60'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span>#{s.num}</span>
                  {isCompleted && <CheckIcon className="w-3 h-3 text-emerald-500 inline" />}
                </div>
                <div className="truncate font-semibold">{s.title}</div>
              </div>
            );
          })}
        </div>

        {/* Wizard Form Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* STEP 1: SOURCE */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <CommandLineIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 1: Choose Application Source &amp; Metadata</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Point to your Git repository (public or SSH-accessible) and specify the deployment branch.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Service Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. payments-api"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-cyber w-full"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="input-cyber w-full"
                  >
                    <option value="application">Application Service</option>
                    <option value="api">REST / GraphQL API</option>
                    <option value="documentation">Documentation Portal</option>
                    <option value="static_site">Static Web Service</option>
                    <option value="status_page">Status Page</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Git Repository URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/myorg/my-service.git"
                  value={gitRepo}
                  onChange={(e) => setGitRepo(e.target.value)}
                  className="input-cyber w-full font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Git Branch</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    className="input-cyber w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Base Blueprint Template</label>
                  <input
                    type="text"
                    readOnly
                    value={templateKey || 'Generic Application Blueprint'}
                    className="input-cyber w-full font-mono bg-slate-100 dark:bg-cyber-850 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: NODE */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ServerStackIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 2: Select Compute Node or Cluster Host</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Choose the VPS node where the application container or process will execute.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  onClick={() => setSelectedNodeId('')}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    selectedNodeId === ''
                      ? 'border-indigo-600 dark:border-cyan-400 bg-indigo-50/40 dark:bg-cyan-950/40'
                      : 'border-slate-200 dark:border-cyber-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">💻</span>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">Local Server (Host Node)</div>
                      <div className="text-[11px] text-slate-500 font-mono">127.0.0.1 • Native Reverse Proxy Co-located</div>
                    </div>
                  </div>
                  <span className="badge-cyan text-[10px] font-mono">Primary Node</span>
                </label>

                {nodes.map(n => (
                  <label
                    key={n.id}
                    onClick={() => setSelectedNodeId(String(n.id))}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedNodeId === String(n.id)
                        ? 'border-indigo-600 dark:border-cyan-400 bg-indigo-50/40 dark:bg-cyan-950/40'
                        : 'border-slate-200 dark:border-cyber-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🖥️</span>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{n.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{n.host} • SSH Verified</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${
                      n.status === 'online' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {n.status}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: RUNTIME */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <WrenchScrewdriverIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 3: Runtime Environment &amp; Build Configuration</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Define build lifecycle commands, internal listening port, and the health check probe endpoint.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Runtime</label>
                  <select
                    value={runtime}
                    onChange={(e) => setRuntime(e.target.value)}
                    className="input-cyber w-full"
                  >
                    <option value="nodejs">Node.js (LTS 20/22)</option>
                    <option value="python">Python 3.11 / ASGI</option>
                    <option value="static">Static HTML5 / JAMstack</option>
                    <option value="docker">Container / Custom Binary</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Internal Port *</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="input-cyber w-full font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Build Command</label>
                  <input
                    type="text"
                    value={buildCommand}
                    onChange={(e) => setBuildCommand(e.target.value)}
                    className="input-cyber w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Start Command</label>
                  <input
                    type="text"
                    value={startCommand}
                    onChange={(e) => setStartCommand(e.target.value)}
                    className="input-cyber w-full font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Health Check Path *</label>
                <input
                  type="text"
                  value={healthCheckPath}
                  onChange={(e) => setHealthCheckPath(e.target.value)}
                  placeholder="/health"
                  className="input-cyber w-full font-mono"
                />
              </div>
            </div>
          )}

          {/* STEP 4: SECRETS */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <KeyIcon className="w-4 h-4 text-indigo-500" />
                    <span>Step 4: Environment Variables &amp; Secrets</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-mono font-bold flex items-center gap-1">
                    <ShieldCheckIcon className="w-4 h-4" /> AES-256 Encrypted
                  </span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Secrets are encrypted at rest with hardware-grade AES-256-GCM and injected at runtime.
                </p>
              </div>

              <div>
                <label className="block font-semibold mb-1">Environment Secrets (JSON format)</label>
                <textarea
                  rows={6}
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  className="input-cyber w-full font-mono text-[11px] leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* STEP 5: DOMAIN */}
          {activeStep === 5 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <GlobeAltIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 5: Subdomain Routing &amp; Domain Selection</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Choose your base domain and define the RFC 1123 subdomain label for public ingress.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Subdomain Prefix *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. auth-api"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    className="input-cyber w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Base Root Domain</label>
                  <select
                    value={baseDomain}
                    onChange={(e) => setBaseDomain(e.target.value)}
                    className="input-cyber w-full font-mono"
                  >
                    {allDomains.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 font-mono text-xs flex items-center justify-between">
                <span className="text-slate-500">Full Public Hostname:</span>
                <strong className="text-indigo-600 dark:text-cyan-400">
                  {subdomain ? `${subdomain.trim().toLowerCase()}.${baseDomain}` : '...'}
                </strong>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={enableHttps}
                  onChange={(e) => setEnableHttps(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Provision automated HTTPS / TLS certificate
                </span>
              </label>
            </div>
          )}

          {/* STEP 6: PREVIEW */}
          {activeStep === 6 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <EyeIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 6: Preview DNS, Reverse-Proxy, and HTTPS Changes</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Pre-flight configuration preview. Verify syntax and confirmed zero conflict with existing services.
                </p>
              </div>

              {loadingPreview ? (
                <div className="p-8 text-center text-slate-400 font-mono animate-pulse">
                  Compiling DNS and Nginx VHost rules...
                </div>
              ) : previewData ? (
                <div className="space-y-3 font-mono text-xs">
                  {/* DNS Record plan */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>DNS Action: {previewData.dns.action.toUpperCase()}</span>
                      <span className="badge-cyan text-[10px]">{previewData.dns.provider}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                      Record: <code>{previewData.dns.recordType} {previewData.dns.hostname} → {previewData.dns.content}</code>
                    </div>
                  </div>

                  {/* Nginx VHost preview */}
                  <div>
                    <label className="block font-semibold mb-1 text-[11px] font-sans text-slate-700 dark:text-slate-300">
                      Generated Nginx Configuration:
                    </label>
                    <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800 max-h-48">
                      {previewData.proxy.configPreview}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* STEP 7: CONFIRM */}
          {activeStep === 7 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-indigo-500" />
                  <span>Step 7: Review Deployment Plan &amp; Final Confirmation</span>
                </h4>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Confirm all operational parameters. Once confirmed, deployment worker will atomically provision DNS, apply reverse proxy rules, and run health probes.
                </p>
              </div>

              <div className="card p-4 bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-slate-200/60 dark:border-cyber-800 pb-1.5">
                  <span className="text-slate-400">Service Name:</span>
                  <strong className="text-slate-900 dark:text-white">{name}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 dark:border-cyber-800 pb-1.5">
                  <span className="text-slate-400">Target Hostname:</span>
                  <strong className="text-indigo-600 dark:text-cyan-400">{subdomain}.{baseDomain}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 dark:border-cyber-800 pb-1.5">
                  <span className="text-slate-400">Git Repository:</span>
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-xs">{gitRepo}#{gitBranch}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 dark:border-cyber-800 pb-1.5">
                  <span className="text-slate-400">Internal Target:</span>
                  <span>127.0.0.1:{port} (Probe: {healthCheckPath})</span>
                </div>
              </div>

              <label className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                />
                <span className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  <strong>Explicit Approval:</strong> I have reviewed the deployment plan, DNS routing changes, and reverse proxy rules. I authorize Commandor Dev Pack to deploy this service and verify runtime health.
                </span>
              </label>
            </div>
          )}

          {/* STEPS 8 - 10: DEPLOYMENT EXECUTION & REMEDIATION */}
          {activeStep >= 8 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/50 dark:bg-cyber-900 rounded-xl border border-indigo-100 dark:border-cyber-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <RocketLaunchIcon className="w-4 h-4 text-indigo-500" />
                    <span>Deployment Execution &amp; Health Probe</span>
                  </h4>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Live stream from controlled worker jobs.
                  </p>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                  workflowState?.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-300' :
                  workflowState?.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-300' :
                  'bg-amber-50 text-amber-600 border-amber-300 animate-pulse'
                }`}>
                  {workflowState?.status || 'deploying'}
                </span>
              </div>

              {/* Live Terminal Logs */}
              <div>
                <label className="block font-semibold mb-1">Controlled Worker Logs:</label>
                <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-[11px] overflow-y-auto max-h-56 border border-slate-800 whitespace-pre-wrap leading-relaxed">
                  {workflowState?.logs || 'Initializing deployment worker...'}
                </pre>
              </div>

              {/* Health check card */}
              {workflowState?.workflow_data?.step9_health && (
                <div className={`p-3 rounded-xl border font-mono text-xs ${
                  workflowState.workflow_data.step9_health.healthy
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                }`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {workflowState.workflow_data.step9_health.healthy ? (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" />
                    )}
                    <span>
                      Health Check Result: {workflowState.workflow_data.step9_health.healthy ? 'PASSED (200 OK)' : 'FAILED / TIMEOUT'}
                    </span>
                  </div>
                  <div className="text-[11px] mt-1">
                    Endpoint: {workflowState.workflow_data.step9_health.endpoint} • Checked at: {workflowState.workflow_data.step9_health.checked_at}
                  </div>
                </div>
              )}

              {/* Remediation & Resume Guidance Card */}
              {workflowState?.status === 'failed' && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <WrenchScrewdriverIcon className="w-4 h-4 text-amber-600" />
                    <span>Remediation Guidance &amp; Recovery Path</span>
                  </div>
                  <p className="leading-relaxed">
                    {workflowState.remediation || 'Deployment halted. Review logs above for details.'}
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={handleResumeWorkflow}
                      disabled={executing}
                      className="btn-primary py-2 px-5 text-xs font-semibold flex items-center gap-1.5 shadow-md"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${executing ? 'animate-spin' : ''}`} />
                      <span>{executing ? 'Resuming Workflow...' : 'Resume Workflow (Without Redoing Steps)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-cyber-800 pt-3">
          {activeStep > 1 && activeStep <= 7 ? (
            <button
              onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
              disabled={executing}
              className="btn-secondary py-1.5 px-4 text-xs flex items-center gap-1"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>{t('common.cancel', 'Back')}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {activeStep <= 7 ? (
              <button
                onClick={handleNextStep}
                disabled={executing || (activeStep === 7 && !confirmed)}
                className="btn-primary py-2 px-5 text-xs font-semibold flex items-center gap-1.5"
              >
                <span>{activeStep === 7 ? t('hosting.deploy_btn', 'Execute Deployment') : t('common.next', 'Next Step')}</span>
                <ArrowRightIcon className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="btn-secondary py-1.5 px-5 text-xs font-semibold"
              >
                {t('common.done', 'Done')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
