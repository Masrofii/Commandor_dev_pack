'use strict';
'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
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
  InformationCircleIcon
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

  // Subdomain Claim Form
  const [showClaim, setShowClaim] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [form, setForm] = useState({
    subdomain: '',
    email_catch_all: true,
    web_enabled: true,
    web_mode: 'landing',
    web_target: '',
    web_custom_body: ''
  });

  // Custom Domain Add Form
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [verifyingId, setVerifyingId] = useState(null);

  // Subdomain Edit & Inspector
  const [editingSub, setEditingSub] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [inspectSub, setInspectSub] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  async function handleClaim(e) {
    e.preventDefault();
    if (!form.subdomain.trim()) {
      toast.error('Subdomain name is required');
      return;
    }
    setClaiming(true);
    try {
      await api.claimSubdomain(form);
      toast.success('Subdomain claimed successfully!');
      setShowClaim(false);
      setForm({
        subdomain: '',
        email_catch_all: true,
        web_enabled: true,
        web_mode: 'landing',
        web_target: '',
        web_custom_body: ''
      });
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
          {/* Claim Subdomain Card/Modal */}
          {showClaim && (
            <div className="card p-5 sm:p-6 border-indigo-200 dark:border-cyber-800 shadow-md animate-fade-in space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Claim Subdomain Routing Point
                </h3>
                <button onClick={() => setShowClaim(false)} className="text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleClaim} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Subdomain Name
                    </label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        placeholder="e.g. dev, api, webhooks"
                        value={form.subdomain}
                        onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                        className="input rounded-r-none font-mono text-xs"
                      />
                      <span className="px-3 py-2 bg-slate-100 dark:bg-cyber-800 border border-l-0 border-slate-200 dark:border-cyber-700 rounded-r-xl text-xs font-mono text-slate-500">
                        .commandor.my.id
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Web Routing Mode
                    </label>
                    <select
                      value={form.web_mode}
                      onChange={(e) => setForm({ ...form, web_mode: e.target.value })}
                      className="input text-xs"
                    >
                      {WEB_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target URL if proxy or redirect */}
                {(form.web_mode === 'proxy' || form.web_mode === 'redirect') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Destination Target URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://my-internal-server.vercel.app or http://127.0.0.1:8080"
                      value={form.web_target}
                      onChange={(e) => setForm({ ...form, web_target: e.target.value })}
                      className="input text-xs font-mono"
                    />
                  </div>
                )}

                {/* Static Body if static */}
                {form.web_mode === 'static' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Static HTML or JSON Payload
                    </label>
                    <textarea
                      rows={3}
                      placeholder="<h1>Hello World</h1> or { 'status': 'ok' }"
                      value={form.web_custom_body}
                      onChange={(e) => setForm({ ...form, web_custom_body: e.target.value })}
                      className="input font-mono text-xs"
                    />
                  </div>
                )}

                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={form.email_catch_all}
                      onChange={(e) => setForm({ ...form, email_catch_all: e.target.checked })}
                      className="rounded border-slate-300 dark:border-cyber-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Email Catch-All Active</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={form.web_enabled}
                      onChange={(e) => setForm({ ...form, web_enabled: e.target.checked })}
                      className="rounded border-slate-300 dark:border-cyber-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Web Traffic Enabled</span>
                  </label>
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
                    type="submit"
                    disabled={claiming}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    {claiming ? 'Claiming...' : 'Claim Subdomain'}
                  </button>
                </div>
              </form>
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
