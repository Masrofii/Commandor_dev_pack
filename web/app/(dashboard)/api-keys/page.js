'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const SCOPES = [
  'aliases:read',
  'aliases:write',
  'emails:read',
  'emails:delete',
  'attachments:read',
  'webhooks:read',
  'webhooks:write'
];

export default function ApiKeysPage() {
  const { data, isLoading, mutate } = useSWR('api-keys', api.getApiKeys);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['aliases:read', 'emails:read']);
  const [newKey, setNewKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const availableScopes = data?.validScopes || SCOPES;

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await api.createApiKey(name, scopes);
      setNewKey(r.rawKey);
      setName('');
      setScopes(['aliases:read', 'emails:read']);
      setShowCreate(false);
      toast.success('API Key generated successfully');
      mutate();
    } catch (e) {
      toast.error(e.message || 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    if (!confirm('Revoke this API key? Any scripts using it will immediately fail.')) return;
    try {
      await api.revokeApiKey(id);
      toast.success('API Key revoked');
      mutate();
    } catch (e) {
      toast.error('Failed to revoke key');
    }
  }

  function toggleScope(s) {
    setScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            API Keys
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Programmatically manage your email aliases and messages with secure tokens
          </p>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="btn-primary py-2 px-3.5 text-xs shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New API Key</span>
        </button>
      </div>

      {/* Newly Created Key Alert */}
      {newKey && (
        <div className="card p-5 border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/60 dark:bg-emerald-950/30 animate-fade-in space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wide">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-600" />
            <span>Key Generated — Copy It Now!</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            For security reasons, this key will never be shown again. Store it safely in your environment variables.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono bg-white dark:bg-slate-800 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex-1 break-all select-all shadow-inner">
              {newKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKey);
                toast.success('Copied API Key!');
                setNewKey(null);
              }}
              className="btn-primary py-2.5 px-4 text-xs flex-shrink-0"
            >
              Copy & Close
            </button>
          </div>
        </div>
      )}

      {/* Create Key Card */}
      {showCreate && (
        <div className="card p-5 sm:p-6 border-indigo-200 dark:border-indigo-900/80 shadow-md animate-fade-in space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Generate New API Key
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Key Name / Description
            </label>
            <input
              type="text"
              placeholder="e.g. CI/CD Tester, Automation Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Permissions & Scopes
            </label>
            <div className="flex flex-wrap gap-2">
              {availableScopes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleScope(s)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-mono transition-all ${
                    scopes.includes(s)
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="btn-secondary py-1.5 px-3.5 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={!name.trim() || scopes.length === 0 || creating}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              {creating ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading API keys...</div>
        ) : (data?.keys || []).length === 0 ? (
          <div className="p-8 text-center">
            <KeyIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">No API keys created</h4>
            <p className="text-xs text-slate-400 mt-1">Create an API key to access your temporary emails via REST API.</p>
          </div>
        ) : (
          (data?.keys || []).map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-750/40 transition-colors"
            >
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{k.name}</span>
                  {k.revoked && <span className="badge-red text-[10px]">Revoked</span>}
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Prefix: <code className="bg-slate-100 dark:bg-slate-750 px-1.5 py-0.5 rounded">{k.key_prefix}...</code>
                </div>
                {k.last_used_at && (
                  <div className="text-[11px] text-slate-400">
                    Last used: {new Date(k.last_used_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {!k.revoked && (
                <button
                  onClick={() => revoke(k.id)}
                  className="btn-danger py-1 px-3 text-xs"
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
