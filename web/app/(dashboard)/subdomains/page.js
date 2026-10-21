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
  CommandLineIcon
} from '@heroicons/react/24/outline';

const WEB_MODES = [
  { value: 'landing', label: 'Default Landing Page' },
  { value: 'proxy', label: 'Reverse Proxy (Upstream URL)' },
  { value: 'redirect', label: 'HTTP 302 Redirect' },
  { value: 'static', label: 'Custom Static HTML/JSON' },
  { value: 'webhook', label: 'Webhook Request Inspector' }
];

export default function SubdomainsPage() {
  const { data, isLoading, mutate } = useSWR('subdomains', () => api.getSubdomains({ limit: 100 }));
  const subdomains = data?.subdomains || [];

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
      mutate();
    } catch (err) {
      toast.error(err.message || 'Failed to claim subdomain');
    } finally {
      setClaiming(false);
    }
  }

  async function handleUpdate(id, updates) {
    setSavingEdit(true);
    try {
      await api.updateSubdomain(id, updates);
      toast.success('Subdomain updated');
      mutate();
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
      mutate();
      if (editingSub?.id === id) setEditingSub(null);
      if (inspectSub?.id === id) setInspectSub(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete subdomain');
    }
  }

  async function viewRequests(sub) {
    setInspectSub(sub);
    setLoadingRequests(true);
    try {
      const res = await api.getSubdomainRequests(sub.id);
      setRequests(res.requests || []);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoadingRequests(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <GlobeAltIcon className="h-7 w-7 text-indigo-500" />
            Subdomain Service
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Claim custom subdomains under commandor.my.id with automatic email catch-all and flexible web routing.
          </p>
        </div>
        <button
          onClick={() => setShowClaim(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Claim Subdomain
        </button>
      </div>

      {/* Subdomains Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
        </div>
      ) : subdomains.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <GlobeAltIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">No subdomains claimed</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by claiming a custom subdomain for your apps, bots, or catch-all email inbox.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowClaim(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Claim Your First Subdomain
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subdomains.map(sub => (
            <div
              key={sub.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-base font-mono">
                      {sub.full_domain}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sub.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {sub.active ? 'Active' : 'Suspended'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 uppercase">
                        Web: {sub.web_mode}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(sub.id, sub.full_domain)}
                    className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                    title="Delete Subdomain"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/60 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <EnvelopeIcon className="h-3.5 w-3.5" />
                      Email Catch-All:
                    </span>
                    <button
                      onClick={() => handleUpdate(sub.id, { email_catch_all: !sub.email_catch_all })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${sub.email_catch_all ? 'text-green-600 bg-green-50 dark:bg-green-950/40 hover:bg-green-100' : 'text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200'}`}
                    >
                      {sub.email_catch_all ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Emails Received:</span>
                    <span className="font-mono font-medium">{sub.emails_received}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Web Requests:</span>
                    <span className="font-mono font-medium">{sub.web_requests_count}</span>
                  </div>

                  {sub.web_target && (
                    <div className="text-xs pt-1 truncate">
                      <span className="text-gray-500 dark:text-gray-400">Target: </span>
                      <span className="font-mono text-indigo-500">{sub.web_target}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-2">
                <button
                  onClick={() => setEditingSub(sub)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 rounded transition-colors"
                >
                  <Cog6ToothIcon className="h-3.5 w-3.5" />
                  Configure
                </button>
                {sub.web_mode === 'webhook' && (
                  <button
                    onClick={() => viewRequests(sub)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-medium text-indigo-600 dark:text-indigo-400 rounded transition-colors"
                  >
                    <CommandLineIcon className="h-3.5 w-3.5" />
                    Inspect Hits
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Claim Subdomain Modal */}
      {showClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <GlobeAltIcon className="h-5 w-5 text-indigo-500" />
                Claim New Subdomain
              </h2>
              <button onClick={() => setShowClaim(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleClaim} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subdomain Name
                </label>
                <div className="flex rounded-lg shadow-sm border border-gray-300 dark:border-gray-600 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                  <input
                    type="text"
                    required
                    placeholder="mybrand"
                    value={form.subdomain}
                    onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 px-3 py-2 bg-transparent text-gray-900 dark:text-white text-sm outline-none font-mono"
                  />
                  <span className="inline-flex items-center px-3 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-mono border-l border-gray-300 dark:border-gray-600">
                    .commandor.my.id
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">Letters, numbers, and hyphens (3-63 characters).</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Web Routing Mode
                </label>
                <select
                  value={form.web_mode}
                  onChange={e => setForm({ ...form, web_mode: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {WEB_MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {(form.web_mode === 'proxy' || form.web_mode === 'redirect') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {form.web_mode === 'proxy' ? 'Upstream Target URL (Reverse Proxy)' : 'Destination Redirect URL'}
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="http://127.0.0.1:8080 or https://example.com"
                    value={form.web_target}
                    onChange={e => setForm({ ...form, web_target: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              )}

              {form.web_mode === 'static' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom HTML / Response Body
                  </label>
                  <textarea
                    rows={4}
                    placeholder="<h1>Welcome to my custom domain!</h1>"
                    value={form.web_custom_body}
                    onChange={e => setForm({ ...form, web_custom_body: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="catchall"
                  checked={form.email_catch_all}
                  onChange={e => setForm({ ...form, email_catch_all: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="catchall" className="text-xs text-gray-700 dark:text-gray-300 select-none cursor-pointer">
                  Enable automatic email catch-all (routes all <code>*@{form.subdomain || 'yoursub'}.commandor.my.id</code> to inbox)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowClaim(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={claiming}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {claiming ? 'Claiming...' : 'Claim Subdomain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Subdomain Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Configure Subdomain</h2>
                <p className="text-xs font-mono text-indigo-500 mt-0.5">{editingSub.full_domain}</p>
              </div>
              <button onClick={() => setEditingSub(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Web Routing Mode
                </label>
                <select
                  value={editingSub.web_mode || 'landing'}
                  onChange={e => setEditingSub({ ...editingSub, web_mode: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none"
                >
                  {WEB_MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {(editingSub.web_mode === 'proxy' || editingSub.web_mode === 'redirect') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target URL ({editingSub.web_mode === 'proxy' ? 'Upstream Proxy' : 'Redirect'})
                  </label>
                  <input
                    type="url"
                    placeholder="http://127.0.0.1:8080"
                    value={editingSub.web_target || ''}
                    onChange={e => setEditingSub({ ...editingSub, web_target: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none font-mono"
                  />
                </div>
              )}

              {editingSub.web_mode === 'static' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom Response Body
                  </label>
                  <textarea
                    rows={4}
                    value={editingSub.web_custom_body || ''}
                    onChange={e => setEditingSub({ ...editingSub, web_custom_body: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none font-mono"
                  />
                </div>
              )}

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 dark:text-gray-300">Email Catch-All (*@{editingSub.full_domain})</span>
                  <input
                    type="checkbox"
                    checked={editingSub.email_catch_all}
                    onChange={e => setEditingSub({ ...editingSub, email_catch_all: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 h-4 w-4"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 dark:text-gray-300">Web Routing Active</span>
                  <input
                    type="checkbox"
                    checked={editingSub.web_enabled}
                    onChange={e => setEditingSub({ ...editingSub, web_enabled: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 h-4 w-4"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdate(editingSub.id, {
                    web_mode: editingSub.web_mode,
                    web_target: editingSub.web_target,
                    web_custom_body: editingSub.web_custom_body,
                    email_catch_all: editingSub.email_catch_all,
                    web_enabled: editingSub.web_enabled
                  })}
                  disabled={savingEdit}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Captured Webhooks Drawer */}
      {inspectSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <CommandLineIcon className="h-5 w-5 text-indigo-500" />
                  Captured HTTP Requests
                </h2>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{inspectSub.full_domain}</p>
              </div>
              <button onClick={() => setInspectSub(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-3 pr-1">
              {loadingRequests ? (
                <div className="text-center py-8">
                  <ArrowPathIcon className="h-6 w-6 text-gray-400 animate-spin mx-auto" />
                </div>
              ) : requests.length === 0 ? (
                <p className="text-sm text-center py-8 text-gray-400">
                  No requests captured yet. Make an HTTP request to <code>http://{inspectSub.full_domain}</code> to see it here!
                </p>
              ) : (
                requests.map(req => (
                  <div key={req.id} className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700/60 text-xs font-mono">
                    <div className="flex items-center justify-between text-gray-500">
                      <span>{req.created_at}</span>
                      <span className="font-bold text-indigo-500">{req.ip || 'unknown IP'}</span>
                    </div>
                    <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                      <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded mr-2">
                        {req.method}
                      </span>
                      {req.path}
                    </div>
                    {req.body && (
                      <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-x-auto text-gray-700 dark:text-gray-300">
                        {req.body}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => viewRequests(inspectSub)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-xs font-medium rounded hover:bg-gray-200"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
