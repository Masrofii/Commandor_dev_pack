'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import {
  GlobeAltIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ClockIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  ServerStackIcon,
  RocketLaunchIcon,
  CodeBracketIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

const WEB_MODES = [
  { value: 'landing', label: 'Default Landing Page' },
  { value: 'proxy', label: 'Reverse Proxy (Upstream URL)' },
  { value: 'redirect', label: 'HTTP 302 Redirect' },
  { value: 'static', label: 'Custom Static HTML/JSON' },
  { value: 'webhook', label: 'Webhook Request Inspector' }
];

export default function SubdomainsAndDomainsPage() {
  const [section, setSection] = useState('subdomains'); // 'subdomains' | 'domains'

  // Subdomains data
  const { data: subData, isLoading: loadingSubs, mutate: mutateSubs } = useSWR('subdomains', () => api.getSubdomains({ limit: 100 }));
  const subdomains = subData?.subdomains || [];

  // Custom Domains data
  const { data: customDomainsData, isLoading: loadingDomains, mutate: mutateDomains } = useSWR('custom-domains', api.getDomainList);
  const customDomains = Array.isArray(customDomainsData) ? customDomainsData : [];

  // Subdomain Base Domains and Cluster Nodes for wizard
  const { data: basesData } = useSWR('subdomain-bases', api.getSubdomainBases);
  const { data: nodesData } = useSWR('hosting-nodes-subdomains', api.getHostingNodes);
  const baseDomains = basesData?.baseDomains || ['commandor.my.id'];
  const defaultBase = basesData?.defaultDomain || baseDomains[0] || 'commandor.my.id';
  const serverIp = basesData?.serverIp || '74.248.38.38';
  const nodes = nodesData?.nodes || [];

  // Subdomain Wizard State
  const [showClaim, setShowClaim] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Name & Domain, 2: Purpose & Mode, 3: Target & Config, 4: DNS & Deploy
  const [claiming, setClaiming] = useState(false);
  const [availability, setAvailability] = useState({ checking: false, checked: false, available: false, error: null });

  const [form, setForm] = useState({
    subdomain: '',
    base_domain: 'commandor.my.id',
    email_catch_all: true,
    web_enabled: true,
    web_mode: 'proxy',
    web_target: '',
    web_custom_body: '<h1>Welcome to my edge service!</h1>\n<p>Deployed with Commandor Dev Pack.</p>',
    web_custom_status: 200,
    web_notify_telegram: true
  });

  async function checkAvailability(name, base) {
    const targetBase = base || form.base_domain || defaultBase;
    if (!name || name.trim().length < 3) {
      setAvailability({ checking: false, checked: false, available: false, error: null });
      return;
    }
    setAvailability({ checking: true, checked: false, available: false, error: null });
    try {
      const res = await api.checkSubdomain(name.trim());
      const baseCheck = res?.check?.find(c => c.base_domain.toLowerCase() === targetBase.toLowerCase());
      const isAvail = baseCheck ? baseCheck.available : (res?.check?.[0]?.available ?? false);
      setAvailability({ checking: false, checked: true, available: isAvail, error: null });
    } catch (err) {
      setAvailability({ checking: false, checked: true, available: false, error: err.message });
    }
  }

  // Custom Domain Add Form
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [verifyingId, setVerifyingId] = useState(null);
  const [checkingHealthId, setCheckingHealthId] = useState(null);
  const [dnsHealthMap, setDnsHealthMap] = useState({});

  // Subdomain Edit & Inspector
  const [editingSub, setEditingSub] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [inspectSub, setInspectSub] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  async function handleClaim(e) {
    if (e) e.preventDefault();
    if (!form.subdomain.trim()) {
      toast.error('Subdomain prefix is required');
      return;
    }
    setClaiming(true);
    try {
      await api.claimSubdomain({
        subdomain: form.subdomain.trim(),
        base_domain: form.base_domain || defaultBase,
        email_catch_all: form.email_catch_all,
        web_enabled: form.web_enabled,
        web_mode: form.web_mode,
        web_target: form.web_target || undefined,
        web_custom_body: form.web_custom_body || undefined,
        web_custom_status: parseInt(form.web_custom_status, 10) || 200,
        web_notify_telegram: form.web_notify_telegram
      });
      toast.success(`Subdomain ${form.subdomain}.${form.base_domain || defaultBase} claimed!`);
      setShowClaim(false);
      setWizardStep(1);
      setForm({
        subdomain: '',
        base_domain: defaultBase,
        email_catch_all: true,
        web_enabled: true,
        web_mode: 'proxy',
        web_target: '',
        web_custom_body: '<h1>Welcome to my edge service!</h1>\n<p>Deployed with Commandor Dev Pack.</p>',
        web_custom_status: 200,
        web_notify_telegram: true
      });
      setAvailability({ checking: false, checked: false, available: false, error: null });
      mutateSubs();
    } catch (err) {
      toast.error(err.message || 'Failed to claim subdomain');
    } finally {
      setClaiming(false);
    }
  }

  async function handleAddDomain(e) {
    e.preventDefault();
    if (!domainInput.trim()) {
      toast.error('Domain name is required');
      return;
    }
    setAddingDomain(true);
    try {
      await api.addDomain(domainInput.trim());
      toast.success('Custom domain added! Configure your DNS records below.');
      setShowAddDomain(false);
      setDomainInput('');
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'Failed to add custom domain');
    } finally {
      setAddingDomain(false);
    }
  }

  async function handleVerifyDomain(id) {
    setVerifyingId(id);
    try {
      const res = await api.verifyDomain(id);
      if (res.verified) {
        toast.success('Domain verified successfully!');
        if (res.health) {
          setDnsHealthMap(prev => ({ ...prev, [id]: res.health }));
        }
      } else {
        toast.error(res.message || 'TXT verification record not found. Please allow DNS to propagate.');
      }
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'DNS verification failed');
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleCheckHealth(id) {
    setCheckingHealthId(id);
    try {
      const health = await api.getDomainHealth(id);
      setDnsHealthMap(prev => ({ ...prev, [id]: health }));
      toast.success('DNS Health check completed!');
    } catch (err) {
      toast.error(err.message || 'Health check failed');
    } finally {
      setCheckingHealthId(null);
    }
  }

  async function handleDeleteDomain(id, domain) {
    if (!confirm(`Delete custom domain "${domain}"?`)) return;
    try {
      await api.deleteDomain(id);
      toast.success('Domain removed');
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'Failed to delete domain');
    }
  }

  async function handleUpdate(id, updates) {
    setSavingEdit(true);
    try {
      await api.updateSubdomain(id, updates);
      toast.success('Subdomain updated');
      mutateSubs();
      if (editingSub && editingSub.id === id) {
        setEditingSub(prev => ({ ...prev, ...updates }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update subdomain');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete subdomain "${name}"? All associated aliases will also be deleted.`)) return;
    try {
      await api.deleteSubdomain(id);
      toast.success('Subdomain deleted');
      mutateSubs();
      if (editingSub?.id === id) setEditingSub(null);
      if (inspectSub?.id === id) setInspectSub(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete subdomain');
    }
  }

  async function handleInspect(sub) {
    setInspectSub(sub);
    setLoadingRequests(true);
    try {
      const res = await api.getSubdomainRequests(sub.id);
      setRequests(res.requests || []);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch requests');
    } finally {
      setLoadingRequests(false);
    }
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Domains & Subdomains
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage subdomain routing, edge reverse proxies, webhook inspectors, and custom domain DNS records
          </p>
        </div>

        {/* Tab Switcher & Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800 text-xs font-semibold">
            <button
              onClick={() => setSection('subdomains')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                section === 'subdomains'
                  ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Subdomains ({subdomains.length})
            </button>
            <button
              onClick={() => setSection('domains')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                section === 'domains'
                  ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Custom Domains ({customDomains.length})
            </button>
          </div>

          {section === 'subdomains' ? (
            <button
              onClick={() => setShowClaim(true)}
              className="btn-primary py-2 px-3.5 text-xs shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Claim Subdomain</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAddDomain(true)}
              className="btn-primary py-2 px-3.5 text-xs shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add Custom Domain</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: SUBDOMAINS */}
      {section === 'subdomains' && (
        <div className="space-y-6">
          {/* Claim Subdomain Card/Modal - Multi-Step Wizard */}
          {showClaim && (
            <div className="card p-5 sm:p-6 border-indigo-200 dark:border-cyber-800 shadow-xl animate-fade-in space-y-6">
              {/* Wizard Header with Progress Stepper */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-4">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <GlobeAltIcon className="w-5 h-5 text-indigo-500" />
                    Subdomain Provisioning Wizard
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Step {wizardStep} of 4 — {
                      wizardStep === 1 ? 'Select Domain & Subdomain Name' :
                      wizardStep === 2 ? 'Choose Web Purpose & Routing Mode' :
                      wizardStep === 3 ? 'Configure Upstream Target & Options' :
                      'DNS Configuration & Instant Deployment'
                    }
                  </p>
                </div>
                <button
                  onClick={() => setShowClaim(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Wizard Stepper Dots */}
              <div className="flex items-center justify-between max-w-md mx-auto px-2">
                {[
                  { step: 1, label: 'Identity' },
                  { step: 2, label: 'Routing' },
                  { step: 3, label: 'Target' },
                  { step: 4, label: 'DNS & Deploy' }
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        wizardStep === s.step
                          ? 'bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-100 dark:ring-indigo-900/50'
                          : wizardStep > s.step
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 dark:bg-cyber-800 text-slate-400'
                      }`}
                    >
                      {wizardStep > s.step ? <CheckIcon className="w-4 h-4" /> : s.step}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:inline ${
                        wizardStep === s.step
                          ? 'text-indigo-600 dark:text-cyan-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* STEP 1: DOMAIN & PREFIX */}
              {wizardStep === 1 && (
                <div className="space-y-4 max-w-xl mx-auto py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Parent Domain
                      </label>
                      <select
                        value={form.base_domain}
                        onChange={(e) => {
                          setForm({ ...form, base_domain: e.target.value });
                          checkAvailability(form.subdomain, e.target.value);
                        }}
                        className="input text-xs w-full"
                      >
                        {baseDomains.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Subdomain Prefix
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="e.g. api, app, auth, blog, status"
                          value={form.subdomain}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                            setForm({ ...form, subdomain: val });
                            checkAvailability(val, form.base_domain);
                          }}
                          className="input font-mono text-xs w-full pr-24"
                        />
                        <div className="absolute right-2.5 top-2 flex items-center">
                          {availability.checking ? (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <ArrowPathIcon className="w-3 h-3 animate-spin" /> Checking
                            </span>
                          ) : availability.checked && form.subdomain ? (
                            availability.available ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded">
                                <CheckCircleIcon className="w-3 h-3" /> Available
                              </span>
                            ) : (
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 rounded">
                                <XMarkIcon className="w-3 h-3" /> Taken
                              </span>
                            )
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live URL Preview Card */}
                  <div className="p-3.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/80 dark:border-cyber-800 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Resulting FQDN:</span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-cyan-400 text-sm">
                        https://{form.subdomain ? form.subdomain : '[subdomain]'}.{form.base_domain || defaultBase}
                      </span>
                    </div>
                    <span className="badge-cyan text-[10px] uppercase font-mono">Edge Point</span>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowClaim(false)}
                      className="btn-secondary py-1.5 px-3.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!form.subdomain || form.subdomain.length < 3 || (availability.checked && !availability.available)}
                      onClick={() => setWizardStep(2)}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                    >
                      <span>Continue to Purpose</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: ROUTING PURPOSE */}
              {wizardStep === 2 && (
                <div className="space-y-4 max-w-xl mx-auto py-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    How would you like to route web traffic to this subdomain?
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      {
                        mode: 'proxy',
                        title: 'Application / Reverse Proxy',
                        desc: 'Route HTTP requests to a cluster node port or local internal server (e.g. 127.0.0.1:3000).',
                        icon: RocketLaunchIcon,
                        color: 'text-indigo-500'
                      },
                      {
                        mode: 'static',
                        title: 'Static HTML / Web Service',
                        desc: 'Serve high-performance HTML/CSS or custom JSON directly from the edge cache.',
                        icon: CodeBracketIcon,
                        color: 'text-cyan-500'
                      },
                      {
                        mode: 'redirect',
                        title: 'HTTP 302 Redirect',
                        desc: 'Forward all visitors to another external website, portfolio, or documentation URL.',
                        icon: ArrowsRightLeftIcon,
                        color: 'text-purple-500'
                      },
                      {
                        mode: 'webhook',
                        title: 'Webhook Request Inspector',
                        desc: 'Capture incoming HTTP POST/GET webhooks with real-time payload logs and Telegram alerts.',
                        icon: CommandLineIcon,
                        color: 'text-emerald-500'
                      },
                      {
                        mode: 'landing',
                        title: 'Email Catch-All & Landing',
                        desc: 'Default edge landing card; ready for email receiving on all addresses (*@subdomain).',
                        icon: EnvelopeIcon,
                        color: 'text-amber-500'
                      }
                    ].map((item) => (
                      <div
                        key={item.mode}
                        onClick={() => setForm({ ...form, web_mode: item.mode })}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          form.web_mode === item.mode
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 dark:border-cyber-800 hover:border-slate-300 dark:hover:border-cyber-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <item.icon className={`w-4 h-4 ${item.color}`} />
                          <span className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                    >
                      <ArrowLeftIcon className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                    >
                      <span>Configure Target</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: TARGET & OPTIONS */}
              {wizardStep === 3 && (
                <div className="space-y-4 max-w-xl mx-auto py-2">
                  {form.web_mode === 'proxy' && (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Upstream Destination URL
                      </label>

                      {nodes.length > 0 && (
                        <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/80 dark:border-cyber-800 space-y-1.5">
                          <span className="text-[11px] text-slate-400 block font-semibold">Auto-fill from Connected Cluster Nodes:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {nodes.map((n) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => setForm({ ...form, web_target: `${n.public_url || 'http://' + n.host + ':' + (n.http_port || 8080)}/sites/${form.subdomain || 'app'}/` })}
                                className="px-2 py-1 bg-white dark:bg-cyber-800 border border-slate-200 dark:border-cyber-700 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-indigo-500 transition-colors"
                              >
                                🖥️ {n.name} ({n.host})
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, web_target: 'http://127.0.0.1:3000' })}
                              className="px-2 py-1 bg-white dark:bg-cyber-800 border border-slate-200 dark:border-cyber-700 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-indigo-500 transition-colors"
                            >
                              Localhost :3000
                            </button>
                          </div>
                        </div>
                      )}

                      <input
                        type="url"
                        placeholder="http://127.0.0.1:8080 or https://my-backend-app.com"
                        value={form.web_target}
                        onChange={(e) => setForm({ ...form, web_target: e.target.value })}
                        className="input font-mono text-xs w-full"
                      />
                    </div>
                  )}

                  {form.web_mode === 'redirect' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Target Redirect URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://github.com/my-profile or https://mysite.com"
                        value={form.web_target}
                        onChange={(e) => setForm({ ...form, web_target: e.target.value })}
                        className="input font-mono text-xs w-full"
                      />
                    </div>
                  )}

                  {form.web_mode === 'static' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Static HTML or JSON Payload
                        </label>
                        <div className="flex items-center gap-1.5">
                          {[
                            {
                              name: 'Under Construction',
                              body: `<!DOCTYPE html><html><body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div><h1>🚧 Under Construction</h1><p>This service is being provisioned on Commandor Dev Pack.</p></div></body></html>`
                            },
                            {
                              name: 'API Status JSON',
                              body: `{\n  "status": "healthy",\n  "service": "operational",\n  "uptime": "99.99%",\n  "version": "1.0.0"\n}`
                            }
                          ].map((tmpl) => (
                            <button
                              key={tmpl.name}
                              type="button"
                              onClick={() => setForm({ ...form, web_custom_body: tmpl.body })}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-cyber-850 hover:bg-indigo-50 dark:hover:bg-cyber-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-cyber-700"
                            >
                              {tmpl.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        rows={4}
                        value={form.web_custom_body}
                        onChange={(e) => setForm({ ...form, web_custom_body: e.target.value })}
                        className="input font-mono text-xs w-full"
                      />
                    </div>
                  )}

                  {/* Feature Switches */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200/70 dark:border-cyber-800 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={form.email_catch_all}
                        onChange={(e) => setForm({ ...form, email_catch_all: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Email Catch-All Active</span>
                        <span className="text-[10px] text-slate-500">Route all *@subdomain incoming emails</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200/70 dark:border-cyber-800 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={form.web_enabled}
                        onChange={(e) => setForm({ ...form, web_enabled: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Web Traffic Active</span>
                        <span className="text-[10px] text-slate-500">Respond to incoming HTTP requests</span>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                    >
                      <ArrowLeftIcon className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(4)}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                    >
                      <span>Review &amp; DNS Guide</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: DNS GUIDANCE & DEPLOY */}
              {wizardStep === 4 && (
                <div className="space-y-4 max-w-xl mx-auto py-2">
                  {/* Review Card */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200/80 dark:border-cyber-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-cyber-800 pb-2">
                      <span>Routing Overview</span>
                      <span className="badge-cyan uppercase font-mono text-[10px]">{form.web_mode} mode</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Public Domain:</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-cyan-400">
                          {form.subdomain}.{form.base_domain || defaultBase}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Target / Handler:</span>
                        <span className="font-mono truncate block text-slate-700 dark:text-slate-300">
                          {form.web_mode === 'proxy' ? form.web_target || 'Internal proxy' : form.web_mode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DNS Records Guidance Card */}
                  <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-cyber-900 border border-indigo-200 dark:border-indigo-900/60 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                        Required DNS Record for your Registrar / Cloudflare:
                      </span>
                    </div>

                    <div className="bg-white dark:bg-cyber-950 p-2.5 rounded-lg border border-indigo-100 dark:border-cyber-800 font-mono text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Type:</span>
                        <span className="font-bold text-indigo-600 dark:text-cyan-400">A Record</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Name / Host:</span>
                        <div className="flex items-center gap-1">
                          <span>{form.subdomain}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(form.subdomain, 'Host')}
                            className="p-0.5 hover:text-indigo-600"
                          >
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Target IPv4:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{serverIp}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(serverIp, 'Server IP')}
                            className="p-0.5 hover:text-indigo-600"
                          >
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-cyber-800">
                        <span className="text-slate-400">Cloudflare Proxy:</span>
                        <span className="text-amber-600 dark:text-amber-400 font-sans font-medium">
                          🟠 Proxied (Orange Cloud) for Auto SSL
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                    >
                      <ArrowLeftIcon className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClaim}
                      disabled={claiming}
                      className="btn-primary py-2 px-5 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                    >
                      {claiming ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          <span>Deploying Subdomain...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="w-4 h-4" />
                          <span>Claim &amp; Deploy Subdomain</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subdomains List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingSubs ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="card p-5 animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 dark:bg-cyber-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-3/4" />
                </div>
              ))
            ) : subdomains.length === 0 ? (
              <div className="col-span-full card p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
                  🌐
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">No subdomains claimed</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Claim your first subdomain to route web traffic, capture webhook requests, or create custom email addresses.
                </p>
                <button onClick={() => setShowClaim(true)} className="btn-primary py-1.5 px-4 text-xs font-semibold">
                  Claim Subdomain
                </button>
              </div>
            ) : (
              subdomains.map((s) => (
                <div key={s.id} className="card p-5 space-y-4 hover:border-indigo-300 dark:hover:border-cyber-700 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {s.full_domain}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                        <span className="badge-cyan text-[10px] uppercase font-mono">
                          {s.web_mode} mode
                        </span>
                        <span>•</span>
                        <span>{s.email_catch_all ? 'Catch-All ON' : 'Catch-All OFF'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {s.web_mode === 'webhook' && (
                        <button
                          onClick={() => handleInspect(s)}
                          className="btn-secondary py-1 px-2.5 text-xs"
                          title="Inspect captured requests"
                        >
                          <CommandLineIcon className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Requests</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(s.id, s.full_domain)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800"
                        title="Delete subdomain"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {s.web_target && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/60 dark:border-cyber-800 text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                      Target: {s.web_target}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-cyber-800">
                    <span className="text-[11px] text-slate-400">
                      Created {new Date(s.created_at).toLocaleDateString()}
                    </span>
                    <a
                      href={`http://${s.full_domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Visit Web Point</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: CUSTOM DOMAINS */}
      {section === 'domains' && (
        <div className="space-y-6">
          {/* Add Domain Card */}
          {showAddDomain && (
            <div className="card p-5 sm:p-6 border-indigo-200 dark:border-cyber-800 shadow-md animate-fade-in space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Connect Custom Domain
                </h3>
                <button onClick={() => setShowAddDomain(false)} className="text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddDomain} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Domain Name (FQDN)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. mycompany.com or mail.mydomain.org"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    className="input text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter the domain or subdomain where you want to route inbound email.
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddDomain(false)}
                    className="btn-secondary py-1.5 px-3.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingDomain || !domainInput.trim()}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    {addingDomain ? 'Adding...' : 'Add Domain'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Custom Domains List & Verification Cards */}
          <div className="space-y-4">
            {loadingDomains ? (
              <div className="card p-8 text-center text-slate-400 text-xs">Loading custom domains...</div>
            ) : customDomains.length === 0 ? (
              <div className="card p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
                  🛡️
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">No custom domains connected</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Connect your own custom domain to receive emails on your company brand (e.g. support@yourdomain.com).
                </p>
                <button onClick={() => setShowAddDomain(true)} className="btn-primary py-1.5 px-4 text-xs font-semibold">
                  Add Custom Domain
                </button>
              </div>
            ) : (
              customDomains.map((d) => (
                <div key={d.id} className="card p-6 space-y-5 border-slate-200 dark:border-cyber-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-cyber-850 border border-indigo-100 dark:border-cyber-700 flex items-center justify-center font-mono font-bold text-indigo-700 dark:text-cyan-400">
                        @
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-slate-900 dark:text-white font-mono">
                            {d.domain}
                          </span>
                          {d.verified ? (
                            <span className="badge-green text-xs">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <span className="badge-yellow text-xs">
                              <ClockIcon className="w-3.5 h-3.5" />
                              <span>Pending DNS Verification</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Added {new Date(d.created_at).toLocaleDateString()}
                          {d.dns_checked_at && ` • Last checked ${formatTimeAgo(d.dns_checked_at)}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCheckHealth(d.id)}
                        disabled={checkingHealthId === d.id}
                        className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                        title="Run deep DNS health check (MX, SPF, DMARC)"
                      >
                        <ArrowPathIcon className={`w-3.5 h-3.5 text-cyan-500 ${checkingHealthId === d.id ? 'animate-spin' : ''}`} />
                        <span>{checkingHealthId === d.id ? 'Diagnosing...' : 'DNS Health'}</span>
                      </button>

                      {!d.verified && (
                        <button
                          onClick={() => handleVerifyDomain(d.id)}
                          disabled={verifyingId === d.id}
                          className="btn-accent py-1.5 px-3.5 text-xs font-semibold"
                        >
                          <ArrowPathIcon className={`w-3.5 h-3.5 ${verifyingId === d.id ? 'animate-spin' : ''}`} />
                          <span>{verifyingId === d.id ? 'Checking DNS...' : 'Verify DNS'}</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteDomain(d.id, d.domain)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800"
                        title="Delete domain"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Live DNS Diagnostic Report */}
                  {dnsHealthMap[d.id] && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-700 text-xs space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-cyan-500" />
                          <span>DNS Health & Routing Diagnostic</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono font-bold ${
                          dnsHealthMap[d.id].overallStatus === 'healthy'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200'
                            : dnsHealthMap[d.id].overallStatus === 'warning'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200'
                        }`}>
                          Status: {dnsHealthMap[d.id].overallStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                        <div className="p-2.5 rounded-lg bg-white dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>MX Routing</span>
                            <span className={dnsHealthMap[d.id].mx.status === 'valid' ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                              {dnsHealthMap[d.id].mx.status === 'valid' ? '✓ Configured' : '✗ Missing'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{dnsHealthMap[d.id].mx.message}</p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>SPF Policy</span>
                            <span className={dnsHealthMap[d.id].spf.status === 'valid' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                              {dnsHealthMap[d.id].spf.status === 'valid' ? '✓ Valid' : '⚠️ Missing'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={dnsHealthMap[d.id].spf.message}>
                            {dnsHealthMap[d.id].spf.record || dnsHealthMap[d.id].spf.message}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>DMARC Protection</span>
                            <span className={dnsHealthMap[d.id].dmarc.status === 'valid' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                              {dnsHealthMap[d.id].dmarc.status === 'valid' ? '✓ Protected' : '⚠️ Warning'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={dnsHealthMap[d.id].dmarc.message}>
                            {dnsHealthMap[d.id].dmarc.record || dnsHealthMap[d.id].dmarc.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DNS Setup Guide Card */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <InformationCircleIcon className="w-4 h-4 text-cyan-500" />
                        <span>Required DNS Records for {d.domain}</span>
                      </span>
                      <span className="text-slate-400 font-normal">Add these records at your DNS registrar (Cloudflare, Namecheap, etc.)</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-cyber-800 text-slate-400">
                            <th className="py-2 pr-4">Type</th>
                            <th className="py-2 pr-4">Host / Name</th>
                            <th className="py-2 pr-4">Value</th>
                            <th className="py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-cyber-900">
                          {/* TXT Verification Record */}
                          <tr>
                            <td className="py-2.5 font-bold text-indigo-600 dark:text-cyan-400">TXT</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300">@</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300 truncate max-w-xs">{d.verification_token}</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => copyToClipboard(d.verification_token, 'TXT verification token')}
                                className="p-1 text-slate-400 hover:text-indigo-600"
                                title="Copy TXT value"
                              >
                                <ClipboardDocumentIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                          {/* MX Record */}
                          <tr>
                            <td className="py-2.5 font-bold text-indigo-600 dark:text-cyan-400">MX</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300">@ (Priority 10)</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300">mail.commandor.my.id</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => copyToClipboard('mail.commandor.my.id', 'MX host')}
                                className="p-1 text-slate-400 hover:text-indigo-600"
                                title="Copy MX value"
                              >
                                <ClipboardDocumentIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                          {/* SPF Record */}
                          <tr>
                            <td className="py-2.5 font-bold text-indigo-600 dark:text-cyan-400">TXT (SPF)</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300">@</td>
                            <td className="py-2.5 text-slate-700 dark:text-slate-300">v=spf1 include:commandor.my.id ~all</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => copyToClipboard('v=spf1 include:commandor.my.id ~all', 'SPF record')}
                                className="p-1 text-slate-400 hover:text-indigo-600"
                                title="Copy SPF value"
                              >
                                <ClipboardDocumentIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Captured Requests Modal */}
      {inspectSub && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setInspectSub(null)}
        >
          <div
            className="card p-6 max-w-2xl w-full max-h-[85vh] flex flex-col space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Captured Requests: {inspectSub.full_domain}
                </h3>
                <p className="text-xs text-slate-500">Live webhook and HTTP inspector stream</p>
              </div>
              <button onClick={() => setInspectSub(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingRequests ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading captured requests...</div>
              ) : requests.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No HTTP requests captured yet.</div>
              ) : (
                requests.map((r) => (
                  <div key={r.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 text-xs font-mono space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-600 dark:text-cyan-400">{r.method} {r.path}</span>
                      <span className="text-[11px] text-slate-400">{new Date(r.created_at).toLocaleTimeString()}</span>
                    </div>
                    {r.body && (
                      <pre className="text-[11px] bg-white dark:bg-cyber-900 p-2.5 rounded-lg border border-slate-200 dark:border-cyber-800 overflow-x-auto text-slate-700 dark:text-slate-300">
                        {r.body}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
