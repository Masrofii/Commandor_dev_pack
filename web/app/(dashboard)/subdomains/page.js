'use client';
import { useState, useEffect } from 'react';
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
  ArrowRightIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const WEB_MODES = [
  { value: 'proxy', label: 'Reverse Proxy (Upstream URL)' },
  { value: 'node_app', label: 'Node Application' },
  { value: 'static', label: 'Static HTML / Web Service' },
  { value: 'redirect', label: 'HTTP 302 Redirect' },
  { value: 'webhook', label: 'Webhook Request Inspector' },
  { value: 'dns_only', label: 'DNS-Only Record' }
];

export default function SubdomainsAndDomainsPage() {
  const [section, setSection] = useState('subdomains'); // 'subdomains' | 'domains'
  const [searchQuery, setSearchQuery] = useState('');

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

  // Combined root domains available for subdomains
  const allAvailableRootDomains = Array.from(new Set([...baseDomains, ...customDomains.map(d => d.domain)]));

  // Subdomain Wizard State (8 Steps)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Domain, 2: Subdomain, 3: Destination, 4: DNS, 5: Proxy, 6: HTTPS, 7: Review & Deploy, 8: Verify

  // Form State for Wizard
  const [wizardForm, setWizardForm] = useState({
    root_domain: defaultBase,
    subdomain: '',
    destination_type: 'proxy', // 'node_app' | 'internal_port' | 'proxy' | 'dns_only' | 'static'
    destination_node_id: '',
    internal_port: 3000,
    target_url: '',
    static_body: '<h1>Welcome to my edge service!</h1>\n<p>Deployed with Commandor Dev Pack.</p>',
    dns_record_type: 'A',
    dns_content: serverIp,
    enable_websocket: true,
    security_headers: true,
    enable_https: true,
    force_https_redirect: true,
    email_catch_all: false,
    confirmation_accepted: false
  });

  // Step 2 Syntax Validation State
  const [syntaxValidation, setSyntaxValidation] = useState({ checking: false, checked: false, valid: false, error: null });

  // Step 7 Preview State
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Step 8 Verification State
  const [verifyingDeployment, setVerifyingDeployment] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [deployedSubdomainId, setDeployedSubdomainId] = useState(null);

  // Table Route Verification Modal
  const [inspectVerifySub, setInspectVerifySub] = useState(null);
  const [modalVerificationRunning, setModalVerificationRunning] = useState(false);
  const [modalVerificationResult, setModalVerificationResult] = useState(null);

  // Safe Delete Modal
  const [deleteTargetSub, setDeleteTargetSub] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({ delete_dns: false, delete_site_data: false });
  const [deletingSub, setDeletingSub] = useState(false);

  // Custom Domain Add Form
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [dnsProviderChoice, setDnsProviderChoice] = useState('manual');
  const [cfToken, setCfToken] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [domainRegistrar, setDomainRegistrar] = useState('');
  const [domainNotes, setDomainNotes] = useState('');
  const [verifyingId, setVerifyingId] = useState(null);
  const [checkingHealthId, setCheckingHealthId] = useState(null);
  const [dnsHealthMap, setDnsHealthMap] = useState({});

  // Captured Requests inspector modal
  const [inspectSub, setInspectSub] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Step 2 Syntax validation trigger
  async function validateStep2(subName, baseDomain) {
    const sub = (subName !== undefined ? subName : wizardForm.subdomain).trim();
    const base = baseDomain || wizardForm.root_domain || defaultBase;
    if (!sub || sub.length < 2) {
      setSyntaxValidation({ checking: false, checked: false, valid: false, error: null });
      return;
    }
    setSyntaxValidation({ checking: true, checked: false, valid: false, error: null });
    try {
      const res = await api.validateSubdomainWizard({ subdomain: sub, base_domain: base });
      setSyntaxValidation({ checking: false, checked: true, valid: res.valid, error: res.error || null });
    } catch (err) {
      setSyntaxValidation({ checking: false, checked: true, valid: false, error: err.message });
    }
  }

  // Step 7 Preview generation
  async function fetchPreview() {
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      let target = wizardForm.target_url;
      if (wizardForm.destination_type === 'internal_port') {
        target = `http://127.0.0.1:${wizardForm.internal_port || 3000}`;
      } else if (wizardForm.destination_type === 'node_app' && wizardForm.destination_node_id) {
        const found = nodes.find(n => String(n.id) === String(wizardForm.destination_node_id));
        if (found) {
          target = found.public_url || `http://${found.host}:${found.http_port || 8080}`;
        }
      }

      const res = await api.previewSubdomainWizard({
        subdomain: wizardForm.subdomain.trim(),
        base_domain: wizardForm.root_domain,
        destination_type: wizardForm.destination_type,
        web_target: target || undefined,
        dns_record_type: wizardForm.dns_record_type,
        dns_content: wizardForm.dns_content,
        enable_https: wizardForm.enable_https,
        enable_websocket: wizardForm.enable_websocket,
        security_headers: wizardForm.security_headers
      });
      setPreviewData(res);
    } catch (err) {
      toast.error(err.message || 'Failed to generate deployment preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  // Step 7 -> Deploy action
  async function handleDeployWizard() {
    if (!wizardForm.confirmation_accepted) {
      toast.error('Please confirm the deployment authorization checkbox');
      return;
    }
    setPreviewLoading(true);
    try {
      let target = wizardForm.target_url;
      if (wizardForm.destination_type === 'internal_port') {
        target = `http://127.0.0.1:${wizardForm.internal_port || 3000}`;
      } else if (wizardForm.destination_type === 'node_app' && wizardForm.destination_node_id) {
        const found = nodes.find(n => String(n.id) === String(wizardForm.destination_node_id));
        if (found) {
          target = found.public_url || `http://${found.host}:${found.http_port || 8080}`;
        }
      }

      const payload = {
        subdomain: wizardForm.subdomain.trim(),
        base_domain: wizardForm.root_domain,
        destination_type: wizardForm.destination_type,
        web_mode: wizardForm.destination_type === 'static' ? 'static' : wizardForm.destination_type === 'dns_only' ? 'dns_only' : 'proxy',
        web_target: target || undefined,
        web_custom_body: wizardForm.destination_type === 'static' ? wizardForm.static_body : undefined,
        dns_record_type: wizardForm.dns_record_type,
        dns_content: wizardForm.dns_content,
        enable_https: wizardForm.enable_https,
        enable_websocket: wizardForm.enable_websocket,
        security_headers: wizardForm.security_headers,
        email_catch_all: wizardForm.email_catch_all,
        confirmation_accepted: true
      };

      const res = await api.deploySubdomainWizard(payload);
      toast.success(`Subdomain ${res.subdomain?.full_domain || wizardForm.subdomain} deployed successfully!`);
      setDeployedSubdomainId(res.subdomain?.id);
      mutateSubs();

      // Proceed to Step 8: Multi-Stage Verification
      setWizardStep(8);
      runVerification(res.subdomain?.id);
    } catch (err) {
      toast.error(err.message || 'Deployment failed');
    } finally {
      setPreviewLoading(false);
    }
  }

  // Step 8 Verification runner
  async function runVerification(id) {
    if (!id) return;
    setVerifyingDeployment(true);
    setVerificationResult(null);
    try {
      const res = await api.verifySubdomainRoute(id);
      setVerificationResult(res);
      if (res.overallStatus === 'healthy') {
        toast.success('All routing, DNS, and TLS checks passed!');
      } else {
        toast('Verification finished with diagnostics notice', { icon: 'ℹ️' });
      }
      mutateSubs();
    } catch (err) {
      toast.error(err.message || 'Verification request failed');
    } finally {
      setVerifyingDeployment(false);
    }
  }

  // Open modal verification for existing subdomain in table
  async function handleOpenVerification(sub) {
    setInspectVerifySub(sub);
    setModalVerificationRunning(true);
    setModalVerificationResult(null);
    try {
      const res = await api.verifySubdomainRoute(sub.id);
      setModalVerificationResult(res);
      mutateSubs();
    } catch (err) {
      toast.error(err.message || 'Verification check failed');
    } finally {
      setModalVerificationRunning(false);
    }
  }

  // Repair route for existing subdomain
  async function handleRepairRoute(id, domain) {
    try {
      toast.loading(`Repairing reverse proxy route for ${domain}...`, { id: 'repair' });
      const res = await api.repairSubdomainRoute(id);
      toast.success(res.message || 'Route repaired and reloaded successfully', { id: 'repair' });
      mutateSubs();
    } catch (err) {
      toast.error(err.message || 'Failed to repair route', { id: 'repair' });
    }
  }

  // Execute safe delete
  async function handleExecuteSafeDelete() {
    if (!deleteTargetSub) return;
    setDeletingSub(true);
    try {
      await api.safeDeleteSubdomain(deleteTargetSub.id, deleteOptions);
      toast.success(`Subdomain "${deleteTargetSub.full_domain}" removed`);
      setDeleteTargetSub(null);
      mutateSubs();
    } catch (err) {
      toast.error(err.message || 'Failed to delete subdomain');
    } finally {
      setDeletingSub(false);
    }
  }

  // Add Custom Domain
  async function handleAddDomain(e) {
    e.preventDefault();
    if (!domainInput.trim()) {
      toast.error('Domain name is required');
      return;
    }
    setAddingDomain(true);
    try {
      await api.addDomainInventory({
        domain: domainInput.trim(),
        dns_provider: dnsProviderChoice,
        cloudflare_api_token: dnsProviderChoice === 'cloudflare' ? cfToken : undefined,
        cloudflare_zone_id: dnsProviderChoice === 'cloudflare' ? cfZoneId : undefined,
        registrar: domainRegistrar.trim() || undefined,
        notes: domainNotes.trim() || undefined
      });
      toast.success('Root domain added to inventory!');
      setShowAddDomain(false);
      setDomainInput('');
      setCfToken('');
      setCfZoneId('');
      setDomainRegistrar('');
      setDomainNotes('');
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'Failed to add root domain');
    } finally {
      setAddingDomain(false);
    }
  }

  // Verify custom domain TXT
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
        toast.error(res.message || 'TXT verification record not found. Please allow DNS propagation.');
      }
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'DNS verification failed');
    } finally {
      setVerifyingId(null);
    }
  }

  // Check custom domain DNS health
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

  // Delete custom domain
  async function handleDeleteDomain(id, domain) {
    if (!confirm(`Delete domain "${domain}" from inventory?`)) return;
    try {
      await api.deleteDomain(id);
      toast.success('Domain removed');
      mutateDomains();
    } catch (err) {
      toast.error(err.message || 'Failed to delete domain');
    }
  }

  // Inspect captured requests
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

  // Filtered subdomains
  const filteredSubs = subdomains.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.full_domain || '').toLowerCase().includes(q) ||
      (s.subdomain || '').toLowerCase().includes(q) ||
      (s.base_domain || '').toLowerCase().includes(q) ||
      (s.web_target || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 pb-24 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Domains &amp; Subdomains
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Guided 8-step subdomain creation wizard, automated Nginx reverse proxy routing, and multi-root DNS inventory.
          </p>
        </div>

        {/* Tab Switcher & Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800 text-xs font-semibold">
            <button
              onClick={() => setSection('subdomains')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                section === 'subdomains'
                  ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Subdomains ({subdomains.length})
            </button>
            <button
              onClick={() => setSection('domains')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                section === 'domains'
                  ? 'bg-white dark:bg-cyber-800 text-indigo-700 dark:text-cyan-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Domain Inventory ({customDomains.length})
            </button>
          </div>

          {section === 'subdomains' ? (
            <button
              onClick={() => {
                setShowWizard(true);
                setWizardStep(1);
                setSyntaxValidation({ checking: false, checked: false, valid: false, error: null });
                setPreviewData(null);
                setVerificationResult(null);
              }}
              className="btn-primary py-2 px-3.5 text-xs shadow-xs font-semibold flex items-center gap-1.5"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>Subdomain Wizard</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAddDomain(true)}
              className="btn-primary py-2 px-3.5 text-xs shadow-xs font-semibold flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add Root Domain</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: SUBDOMAINS */}
      {section === 'subdomains' && (
        <div className="space-y-6">
          {/* Search bar */}
          <div className="card p-3 flex items-center gap-2 text-xs border-slate-200 dark:border-cyber-800">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 ml-1" />
            <input
              type="text"
              placeholder="Search subdomains by hostname, root domain, or target..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-2 text-xs w-full border-none focus:ring-0 bg-transparent"
            />
          </div>

          {/* Subdomains Table */}
          <div className="card overflow-hidden border-slate-200 dark:border-cyber-800 shadow-xs">
            {loadingSubs ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading subdomains...</div>
            ) : filteredSubs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
                  🌐
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {searchQuery ? 'No matching subdomains' : 'No subdomains provisioned yet'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Use the Subdomain Wizard to set up reverse proxy routes, point DNS records, and automate TLS certificates.
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => {
                      setShowWizard(true);
                      setWizardStep(1);
                    }}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    Launch Subdomain Wizard
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-cyber-900 border-b border-slate-200 dark:border-cyber-800 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Hostname &amp; Root</th>
                      <th className="py-3 px-4">Destination Target</th>
                      <th className="py-3 px-3 text-center">DNS</th>
                      <th className="py-3 px-3 text-center">Proxy</th>
                      <th className="py-3 px-3 text-center">HTTPS</th>
                      <th className="py-3 px-4">Last Verified</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-cyber-800">
                    {filteredSubs.map((sub) => {
                      const dnsStatus = sub.dns_status || 'configured';
                      const proxyStatus = sub.proxy_status || (sub.web_enabled ? 'active' : 'disabled');
                      const httpsStatus = sub.https_status || (sub.ssl_enabled ? 'secured' : 'none');

                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-cyber-850/50 transition-colors">
                          {/* Hostname */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${sub.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              <a
                                href={`http://${sub.full_domain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-cyan-400 flex items-center gap-1"
                              >
                                {sub.full_domain}
                                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-slate-400" />
                              </a>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              Root: {sub.base_domain}
                            </div>
                          </td>

                          {/* Destination */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-xs">
                              {sub.web_target || sub.web_mode}
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              Mode: {sub.web_mode}
                            </div>
                          </td>

                          {/* DNS Status */}
                          <td className="py-3.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              dnsStatus === 'configured' || dnsStatus === 'healthy'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            }`}>
                              {dnsStatus}
                            </span>
                          </td>

                          {/* Proxy Status */}
                          <td className="py-3.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              proxyStatus === 'active' || proxyStatus === 'routed'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-cyber-800 dark:text-slate-400'
                            }`}>
                              {proxyStatus}
                            </span>
                          </td>

                          {/* HTTPS Status */}
                          <td className="py-3.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center justify-center gap-1 mx-auto w-fit ${
                              httpsStatus === 'secured' || httpsStatus === 'valid'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : httpsStatus === 'warning'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-cyber-800 dark:text-slate-400'
                            }`}>
                              {httpsStatus === 'secured' ? <LockClosedIcon className="w-3 h-3" /> : null}
                              <span>{httpsStatus}</span>
                            </span>
                          </td>

                          {/* Last Verified */}
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            {sub.last_verified_at ? formatTimeAgo(sub.last_verified_at) : formatTimeAgo(sub.created_at)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenVerification(sub)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                                title="Run Multi-Stage Verification"
                              >
                                <ShieldCheckIcon className="w-4 h-4 text-cyan-500" />
                              </button>
                              <button
                                onClick={() => handleRepairRoute(sub.id, sub.full_domain)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                                title="Repair / Regenerate Proxy Route"
                              >
                                <WrenchScrewdriverIcon className="w-4 h-4" />
                              </button>
                              {sub.web_mode === 'webhook' && (
                                <button
                                  onClick={() => handleInspect(sub)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                                  title="Inspect Captured Webhook Requests"
                                >
                                  <CommandLineIcon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteTargetSub(sub)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                                title="Safe Delete Subdomain"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: CUSTOM DOMAINS INVENTORY */}
      {section === 'domains' && (
        <div className="space-y-6">
          {/* Custom Domains List & Verification Cards */}
          <div className="space-y-4">
            {loadingDomains ? (
              <div className="card p-8 text-center text-slate-400 text-xs">Loading root domains...</div>
            ) : customDomains.length === 0 ? (
              <div className="card p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
                  🛡️
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">No custom root domains in inventory</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add root domains with Cloudflare API tokens or manual DNS mode to issue subdomains and routes on your custom brands.
                </p>
                <button onClick={() => setShowAddDomain(true)} className="btn-primary py-1.5 px-4 text-xs font-semibold">
                  Add Root Domain
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
                          <span className="badge-cyan text-[10px] uppercase font-mono">
                            {d.dns_provider || 'manual'}
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
                          {d.registrar && ` • Registrar: ${d.registrar}`}
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

                  {/* DNS Health Diagnostic Display */}
                  {dnsHealthMap[d.id] && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-700 text-xs space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-cyan-500" />
                          <span>DNS Health &amp; Routing Diagnostic</span>
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

                  {/* Required DNS Records Table */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-950 border border-slate-200/80 dark:border-cyber-800 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <InformationCircleIcon className="w-4 h-4 text-cyan-500" />
                        <span>Authoritative DNS Instructions for {d.domain}</span>
                      </span>
                      <span className="text-slate-400 font-normal">Add these records at your DNS registrar or Cloudflare dashboard</span>
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

      {/* 8-STEP SUBDOMAIN GUIDED WIZARD MODAL */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-5 sm:p-6 space-y-5 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in max-h-[92vh] overflow-y-auto">
            {/* Wizard Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-indigo-500" />
                  Subdomain Guided Provisioning Wizard
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Step {wizardStep} of 8 — {
                    wizardStep === 1 ? 'Select Root Domain' :
                    wizardStep === 2 ? 'Enter Subdomain & Validate Syntax' :
                    wizardStep === 3 ? 'Choose Destination Target' :
                    wizardStep === 4 ? 'Configure DNS & Conflict Check' :
                    wizardStep === 5 ? 'Configure Reverse Proxy Route' :
                    wizardStep === 6 ? 'Enable HTTPS & TLS Certificates' :
                    wizardStep === 7 ? 'Review Summary & Deploy' :
                    'Multi-Stage Route Verification'
                  }
                </p>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div className="flex items-center justify-between max-w-xl mx-auto px-1 py-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      wizardStep === s
                        ? 'bg-indigo-600 text-white shadow-xs ring-4 ring-indigo-100 dark:ring-indigo-900/50'
                        : wizardStep > s
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 dark:bg-cyber-800 text-slate-400'
                    }`}
                  >
                    {wizardStep > s ? <CheckIcon className="w-3.5 h-3.5" /> : s}
                  </div>
                  {s < 8 && (
                    <div className={`h-0.5 w-3 sm:w-6 ${wizardStep > s ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-cyber-800'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* STEP 1: SELECT ROOT DOMAIN */}
            {wizardStep === 1 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Target Root Domain
                  </label>
                  <select
                    value={wizardForm.root_domain}
                    onChange={(e) => setWizardForm({ ...wizardForm, root_domain: e.target.value })}
                    className="input text-xs w-full"
                  >
                    {allAvailableRootDomains.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Choose from default cluster domains or verified custom domains in your inventory.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 text-slate-600 dark:text-slate-400 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Need a different root domain?</span>
                  Switch to the "Domain Inventory" tab to add and verify external root domains.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowWizard(false)}
                    className="btn-secondary py-1.5 px-3.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next: Subdomain Name</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: ENTER SUBDOMAIN & SYNTAX VALIDATION */}
            {wizardStep === 2 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subdomain Prefix
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. app, api, panel, git, status"
                      value={wizardForm.subdomain}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        setWizardForm({ ...wizardForm, subdomain: val });
                        validateStep2(val, wizardForm.root_domain);
                      }}
                      className="input font-mono text-xs w-full pr-24"
                    />
                    <div className="absolute right-2.5 top-2 flex items-center">
                      {syntaxValidation.checking ? (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <ArrowPathIcon className="w-3 h-3 animate-spin" /> Checking
                        </span>
                      ) : syntaxValidation.checked && wizardForm.subdomain ? (
                        syntaxValidation.valid ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded">
                            <CheckCircleIcon className="w-3 h-3" /> Valid
                          </span>
                        ) : (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 rounded">
                            <XMarkIcon className="w-3 h-3" /> Conflict
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                  {syntaxValidation.error && (
                    <p className="text-[11px] text-rose-500 mt-1 font-medium">{syntaxValidation.error}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    RFC 1123 compliant. Reserved prefixes (admin, api, mail, localhost) are rejected.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 text-xs">
                  <span className="text-slate-400 block text-[11px]">Fully Qualified Domain Name (FQDN):</span>
                  <span className="font-mono font-bold text-sm text-indigo-600 dark:text-cyan-400">
                    https://{wizardForm.subdomain || '[subdomain]'}.{wizardForm.root_domain}
                  </span>
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
                    disabled={!wizardForm.subdomain || (syntaxValidation.checked && !syntaxValidation.valid)}
                    onClick={() => setWizardStep(3)}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next: Choose Destination</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CHOOSE DESTINATION */}
            {wizardStep === 3 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Select Destination Type
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      type: 'proxy',
                      title: 'Reverse Proxy Upstream',
                      desc: 'Forward traffic to any external URL or HTTP backend.',
                      icon: RocketLaunchIcon
                    },
                    {
                      type: 'internal_port',
                      title: 'Internal Service & Port',
                      desc: 'Route to localhost:port (e.g. 127.0.0.1:3000).',
                      icon: ServerStackIcon
                    },
                    {
                      type: 'node_app',
                      title: 'Cluster Node Application',
                      desc: 'Route to a service running on one of your enrolled nodes.',
                      icon: CpuChipIcon
                    },
                    {
                      type: 'static',
                      title: 'Static Site / Edge Response',
                      desc: 'Serve high-speed HTML, CSS, or custom JSON from edge.',
                      icon: CodeBracketIcon
                    },
                    {
                      type: 'dns_only',
                      title: 'DNS-Only Record',
                      desc: 'Create an A or CNAME DNS record without local proxy.',
                      icon: GlobeAltIcon
                    }
                  ].map((item) => (
                    <div
                      key={item.type}
                      onClick={() => setWizardForm({ ...wizardForm, destination_type: item.type })}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        wizardForm.destination_type === item.type
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-cyber-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <item.icon className="w-4 h-4 text-indigo-500" />
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Destination Inputs */}
                {wizardForm.destination_type === 'proxy' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Upstream Target URL
                    </label>
                    <input
                      type="url"
                      placeholder="http://10.0.0.5:8080 or https://external-app.internal"
                      value={wizardForm.target_url}
                      onChange={(e) => setWizardForm({ ...wizardForm, target_url: e.target.value })}
                      className="input font-mono text-xs w-full"
                      required
                    />
                  </div>
                )}

                {wizardForm.destination_type === 'internal_port' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Internal Port (127.0.0.1:port)
                    </label>
                    <input
                      type="number"
                      placeholder="3000"
                      value={wizardForm.internal_port}
                      onChange={(e) => setWizardForm({ ...wizardForm, internal_port: parseInt(e.target.value, 10) || 3000 })}
                      className="input font-mono text-xs w-full"
                    />
                  </div>
                )}

                {wizardForm.destination_type === 'node_app' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Cluster Node
                    </label>
                    <select
                      value={wizardForm.destination_node_id}
                      onChange={(e) => setWizardForm({ ...wizardForm, destination_node_id: e.target.value })}
                      className="input text-xs w-full"
                    >
                      <option value="">Select a connected node...</option>
                      {nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name} ({n.host})</option>
                      ))}
                    </select>
                  </div>
                )}

                {wizardForm.destination_type === 'static' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Static HTML or JSON Payload
                    </label>
                    <textarea
                      rows={3}
                      value={wizardForm.static_body}
                      onChange={(e) => setWizardForm({ ...wizardForm, static_body: e.target.value })}
                      className="input font-mono text-[11px] w-full"
                    />
                  </div>
                )}

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
                    <span>Next: Configure DNS</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: CONFIGURE DNS */}
            {wizardStep === 4 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Record Type
                    </label>
                    <select
                      value={wizardForm.dns_record_type}
                      onChange={(e) => setWizardForm({ ...wizardForm, dns_record_type: e.target.value })}
                      className="input text-xs w-full"
                    >
                      <option value="A">A (IPv4)</option>
                      <option value="CNAME">CNAME (Alias)</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target IP or Canonical Hostname
                    </label>
                    <input
                      type="text"
                      value={wizardForm.dns_content}
                      onChange={(e) => setWizardForm({ ...wizardForm, dns_content: e.target.value })}
                      className="input font-mono text-xs w-full"
                    />
                  </div>
                </div>

                {/* Proposed DNS changes review */}
                <div className="p-3.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheckIcon className="w-4 h-4 text-indigo-500" />
                      Proposed DNS Record
                    </span>
                    <span className="font-mono text-indigo-600 dark:text-cyan-400 font-bold">{wizardForm.dns_record_type}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Record Name:</span>
                      <span>{wizardForm.subdomain}.{wizardForm.root_domain}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Points To:</span>
                      <span className="truncate block">{wizardForm.dns_content}</span>
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
                    onClick={() => setWizardStep(5)}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next: Reverse Proxy</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: CONFIGURE REVERSE PROXY */}
            {wizardStep === 5 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Nginx Reverse Proxy Parameters
                </label>

                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wizardForm.enable_websocket}
                      onChange={(e) => setWizardForm({ ...wizardForm, enable_websocket: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Enable WebSocket Upgrades</span>
                      <span className="text-[11px] text-slate-500">Injects Upgrade and Connection headers for Socket.IO / WS endpoints</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wizardForm.security_headers}
                      onChange={(e) => setWizardForm({ ...wizardForm, security_headers: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Security &amp; Privacy Headers</span>
                      <span className="text-[11px] text-slate-500">Adds X-Frame-Options, X-Content-Type-Options, and Referrer-Policy</span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(4)}
                    className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                  >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(6)}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next: HTTPS / TLS</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: ENABLE HTTPS */}
            {wizardStep === 6 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  TLS / SSL Security Settings
                </label>

                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wizardForm.enable_https}
                      onChange={(e) => setWizardForm({ ...wizardForm, enable_https: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Enable Automated TLS (HTTPS)</span>
                      <span className="text-[11px] text-slate-500">Binds ACME TLS certificates and enables port 443 listeners</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wizardForm.force_https_redirect}
                      onChange={(e) => setWizardForm({ ...wizardForm, force_https_redirect: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">Force HTTP to HTTPS 301 Redirect</span>
                      <span className="text-[11px] text-slate-500">Automatically redirect plaintext HTTP visitors to secure HTTPS</span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(5)}
                    className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                  >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardStep(7);
                      fetchPreview();
                    }}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next: Review &amp; Deploy</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: REVIEW & DEPLOY */}
            {wizardStep === 7 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                {previewLoading ? (
                  <div className="p-8 text-center">
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-xs text-slate-500 mt-2">Generating configuration preview and checking DNS conflicts...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-3">
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-cyber-800 pb-2">
                        <span>Deployment Configuration Summary</span>
                        <span className="badge-cyan text-[10px] uppercase font-mono">{wizardForm.destination_type}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div>
                          <span className="text-slate-400 block text-[10px]">FQDN:</span>
                          <span className="font-bold text-indigo-600 dark:text-cyan-400">
                            {wizardForm.subdomain}.{wizardForm.root_domain}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Destination:</span>
                          <span className="truncate block">
                            {wizardForm.destination_type === 'internal_port' ? `127.0.0.1:${wizardForm.internal_port}` : wizardForm.target_url || wizardForm.destination_type}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">DNS Action:</span>
                          <span>{wizardForm.dns_record_type} &rarr; {wizardForm.dns_content}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">HTTPS / TLS:</span>
                          <span className={wizardForm.enable_https ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                            {wizardForm.enable_https ? 'Enabled (Auto ACME)' : 'Disabled'}
                          </span>
                        </div>
                      </div>

                      {previewData?.conflictWarning && (
                        <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 font-sans text-[11px] flex items-center gap-1.5">
                          <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>{previewData.conflictWarning}</span>
                        </div>
                      )}
                    </div>

                    {/* Explicit Confirmation Gate */}
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/60 dark:bg-cyber-900 border border-indigo-200 dark:border-indigo-900/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizardForm.confirmation_accepted}
                        onChange={(e) => setWizardForm({ ...wizardForm, confirmation_accepted: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-indigo-950 dark:text-indigo-200 block text-xs">
                          Authorize Automated Deployment
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          I confirm the creation of the reverse proxy virtual host and DNS configuration for this subdomain.
                        </span>
                      </div>
                    </label>

                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep(6)}
                        className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1"
                      >
                        <ArrowLeftIcon className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                      <button
                        type="button"
                        disabled={!wizardForm.confirmation_accepted}
                        onClick={handleDeployWizard}
                        className="btn-primary py-1.5 px-4 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>Deploy Subdomain Now</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 8: MULTI-STAGE VERIFICATION */}
            {wizardStep === 8 && (
              <div className="space-y-4 max-w-lg mx-auto py-2 text-xs">
                <div className="text-center space-y-1 pb-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Multi-Stage Route Verification
                  </h4>
                  <p className="text-slate-500 text-[11px]">
                    Validating authoritative DNS resolution, reverse proxy HTTP reachability, and TLS certificates.
                  </p>
                </div>

                {verifyingDeployment ? (
                  <div className="p-8 text-center">
                    <ArrowPathIcon className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
                    <p className="text-xs text-slate-500 mt-3 font-semibold">Running multi-stage verification suite...</p>
                  </div>
                ) : verificationResult ? (
                  <div className="space-y-3">
                    {/* Stage 1: DNS Resolution */}
                    <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <GlobeAltIcon className="w-4 h-4 text-indigo-500" />
                          <span>1. DNS Resolution</span>
                        </span>
                        <span className={verificationResult.dns?.status === 'valid' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                          {verificationResult.dns?.status === 'valid' ? '✓ Resolved' : '⚠️ Pending'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{verificationResult.dns?.message || 'DNS resolution check complete'}</p>
                    </div>

                    {/* Stage 2: Reverse Proxy Reachability */}
                    <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <ServerStackIcon className="w-4 h-4 text-cyan-500" />
                          <span>2. Reverse Proxy Reachability</span>
                        </span>
                        <span className={verificationResult.http?.status === 'reachable' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                          {verificationResult.http?.status === 'reachable' ? `✓ Reachable (${verificationResult.http?.statusCode || 200})` : '⚠️ Check upstream'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{verificationResult.http?.message || 'Reverse proxy routing check complete'}</p>
                    </div>

                    {/* Stage 3: HTTPS & TLS Handshake */}
                    <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                          <span>3. HTTPS &amp; TLS Handshake</span>
                        </span>
                        <span className={verificationResult.tls?.valid ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                          {verificationResult.tls?.valid ? `✓ Secured (${verificationResult.tls?.daysRemaining || 0}d left)` : '⚠️ Cert Pending'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{verificationResult.tls?.message || 'TLS certificate handshake verified'}</p>
                    </div>

                    {/* Remediation Tips if not healthy */}
                    {verificationResult.remediation && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 space-y-1">
                        <span className="font-bold block flex items-center gap-1">
                          <InformationCircleIcon className="w-4 h-4" /> Remediation Guidance:
                        </span>
                        <p className="text-[11px]">{verificationResult.remediation}</p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => runVerification(deployedSubdomainId)}
                    disabled={verifyingDeployment}
                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  >
                    <ArrowPathIcon className={`w-3.5 h-3.5 ${verifyingDeployment ? 'animate-spin' : ''}`} />
                    <span>Re-Run Verification</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWizard(false)}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    Finish &amp; Close Wizard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT MULTI-STAGE VERIFICATION MODAL (FROM TABLE) */}
      {inspectVerifySub && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-cyan-500" />
                  Route Diagnostics — {inspectVerifySub.full_domain}
                </h3>
                <p className="text-xs text-slate-500">Live multi-stage verification report</p>
              </div>
              <button
                onClick={() => setInspectVerifySub(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {modalVerificationRunning ? (
              <div className="p-8 text-center">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
                <p className="text-xs text-slate-500 mt-3 font-semibold">Running diagnostics on {inspectVerifySub.full_domain}...</p>
              </div>
            ) : modalVerificationResult ? (
              <div className="space-y-3 text-xs">
                {/* 1. DNS */}
                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>1. Authoritative DNS Resolution</span>
                    <span className={modalVerificationResult.dns?.status === 'valid' ? 'text-emerald-500' : 'text-amber-500'}>
                      {modalVerificationResult.dns?.status === 'valid' ? '✓ Resolved' : '⚠️ Pending'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{modalVerificationResult.dns?.message}</p>
                </div>

                {/* 2. Proxy Reachability */}
                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>2. Reverse Proxy Reachability</span>
                    <span className={modalVerificationResult.http?.status === 'reachable' ? 'text-emerald-500' : 'text-amber-500'}>
                      {modalVerificationResult.http?.status === 'reachable' ? `✓ Reachable (${modalVerificationResult.http?.statusCode || 200})` : '⚠️ Down'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{modalVerificationResult.http?.message}</p>
                </div>

                {/* 3. HTTPS */}
                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span>3. HTTPS &amp; TLS Handshake</span>
                    <span className={modalVerificationResult.tls?.valid ? 'text-emerald-500' : 'text-amber-500'}>
                      {modalVerificationResult.tls?.valid ? `✓ Valid (${modalVerificationResult.tls?.daysRemaining || 0}d left)` : '⚠️ Cert Warning'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{modalVerificationResult.tls?.message}</p>
                </div>

                {modalVerificationResult.remediation && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                    <span className="font-bold block mb-1">Remediation:</span>
                    <p className="text-[11px]">{modalVerificationResult.remediation}</p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => handleOpenVerification(inspectVerifySub)}
                disabled={modalVerificationRunning}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${modalVerificationRunning ? 'animate-spin' : ''}`} />
                <span>Re-Check</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectVerifySub(null)}
                className="btn-primary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAFE DELETE MODAL */}
      {deleteTargetSub && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border-rose-200 dark:border-rose-950 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <ExclamationTriangleIcon className="w-5 h-5" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Safe Delete Subdomain
                </h3>
              </div>
              <button onClick={() => setDeleteTargetSub(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to remove <span className="font-mono font-bold text-slate-900 dark:text-white">{deleteTargetSub.full_domain}</span>?
              Reverse proxy routes will be disabled.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteOptions.delete_dns}
                  onChange={(e) => setDeleteOptions({ ...deleteOptions, delete_dns: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <span className="text-slate-700 dark:text-slate-300">Also delete external DNS record at DNS provider</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteOptions.delete_site_data}
                  onChange={(e) => setDeleteOptions({ ...deleteOptions, delete_site_data: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <span className="text-slate-700 dark:text-slate-300">Also delete associated static files and application data</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetSub(null)}
                className="btn-secondary py-1.5 px-3.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSub}
                onClick={handleExecuteSafeDelete}
                className="btn-danger py-1.5 px-4 text-xs font-semibold"
              >
                {deletingSub ? 'Removing...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ROOT DOMAIN MODAL */}
      {showAddDomain && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <GlobeAltIcon className="w-5 h-5 text-indigo-500" />
                  Connect Root Domain to Inventory
                </h3>
                <p className="text-xs text-slate-500">Add an apex domain or zone to manage subdomains and routing.</p>
              </div>
              <button onClick={() => setShowAddDomain(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDomain} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Root Domain (FQDN)
                </label>
                <input
                  type="text"
                  placeholder="e.g. mycompany.com or devplatform.org"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  className="input font-mono text-xs w-full"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  DNS Provider Integration
                </label>
                <div className="flex rounded-lg bg-slate-100 dark:bg-cyber-850 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setDnsProviderChoice('manual')}
                    className={`flex-1 py-1 rounded text-xs font-semibold transition-all ${
                      dnsProviderChoice === 'manual'
                        ? 'bg-white dark:bg-cyber-800 text-indigo-600 dark:text-cyan-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Manual DNS Instructions
                  </button>
                  <button
                    type="button"
                    onClick={() => setDnsProviderChoice('cloudflare')}
                    className={`flex-1 py-1 rounded text-xs font-semibold transition-all ${
                      dnsProviderChoice === 'cloudflare'
                        ? 'bg-white dark:bg-cyber-800 text-indigo-600 dark:text-cyan-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Cloudflare API Integration
                  </button>
                </div>
              </div>

              {dnsProviderChoice === 'cloudflare' && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Cloudflare Scoped API Token
                    </label>
                    <input
                      type="password"
                      placeholder="Cloudflare API Token (Zone:DNS:Edit permission)"
                      value={cfToken}
                      onChange={(e) => setCfToken(e.target.value)}
                      className="input font-mono text-xs w-full"
                      required={dnsProviderChoice === 'cloudflare'}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Zone ID (Optional — auto-discovered if blank)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 023e105f4ecef8ad9ca31a8372d0c353"
                      value={cfZoneId}
                      onChange={(e) => setCfZoneId(e.target.value)}
                      className="input font-mono text-xs w-full"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registrar (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Namecheap, Cloudflare, Porkbun"
                    value={domainRegistrar}
                    onChange={(e) => setDomainRegistrar(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Project tag or team owner"
                    value={domainNotes}
                    onChange={(e) => setDomainNotes(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  {addingDomain ? 'Adding Domain...' : 'Enroll Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAPTURED REQUESTS INSPECTOR MODAL */}
      {inspectSub && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setInspectSub(null)}
        >
          <div
            className="card p-6 max-w-2xl w-full max-h-[85vh] flex flex-col space-y-4 shadow-2xl"
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
                <XMarkIcon className="w-5 h-5" />
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
