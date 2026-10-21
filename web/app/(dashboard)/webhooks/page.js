'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import {
  LinkIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

const EVENTS = [
  'email.received',
  'email.deleted',
  'alias.created',
  'alias.expired',
  'alias.deleted'
];

export default function WebhooksPage() {
  const { data, isLoading, mutate } = useSWR('webhooks', api.getWebhooks);
  const [form, setForm] = useState({
    name: '',
    url: '',
    secret: '',
    eventTypes: ['email.received']
  });
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function create() {
    if (!form.name.trim() || !form.url.trim()) return;
    setCreating(true);
    try {
      await api.createWebhook(form);
      setForm({ name: '', url: '', secret: '', eventTypes: ['email.received'] });
      setShowAdd(false);
      toast.success('Webhook created successfully');
      mutate();
    } catch (e) {
      toast.error(e.message || 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  }

  async function del(id) {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      await api.deleteWebhook(id);
      toast.success('Webhook deleted');
      mutate();
    } catch (e) {
      toast.error('Failed to delete webhook');
    }
  }

  function toggleEvent(e) {
    setForm((f) => ({
      ...f,
      eventTypes: f.eventTypes.includes(e)
        ? f.eventTypes.filter((x) => x !== e)
        : [...f.eventTypes, e]
    }));
  }

  const webhooks = data || [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Webhooks
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dispatch HTTP POST requests in real-time when emails arrive or aliases expire
          </p>
        </div>

        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary py-2 px-3.5 text-xs shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Webhook</span>
        </button>
      </div>

      {/* Add Webhook Form */}
      {showAdd && (
        <div className="card p-5 sm:p-6 border-indigo-200 dark:border-indigo-900/80 shadow-md animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Configure New Webhook
            </h3>
            <button
              onClick={() => setShowAdd(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Webhook Name
              </label>
              <input
                placeholder="e.g. Discord Notifier, Zapier Endpoint"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Payload URL (HTTPS)
              </label>
              <input
                placeholder="https://example.com/api/webhooks/incoming"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="input font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Signing Secret (Optional, for HMAC verification)
              </label>
              <input
                placeholder="whsec_..."
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                className="input font-mono text-xs"
                type="password"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Trigger Events
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-mono transition-all ${
                      form.eventTypes.includes(ev)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowAdd(false)}
              className="btn-secondary py-1.5 px-3.5 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={!form.name || !form.url || creating}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              {creating ? 'Saving...' : 'Save Webhook'}
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center">
            <LinkIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">No webhooks configured</h4>
            <p className="text-xs text-slate-400 mt-1">
              Add a webhook to forward incoming email events to external services.
            </p>
          </div>
        ) : (
          webhooks.map((w) => {
            let events = [];
            try {
              events = JSON.parse(w.event_types || '[]');
            } catch {}

            return (
              <div
                key={w.id}
                className="flex items-start justify-between p-4 sm:p-5 hover:bg-slate-50/70 dark:hover:bg-slate-750/40 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 pr-4">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {w.name}
                  </div>
                  <div className="text-xs font-mono text-slate-400 truncate max-w-sm sm:max-w-md">
                    {w.url}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {events.map((e) => (
                      <span key={e} className="badge-indigo text-[10px] font-mono py-0 px-2">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => del(w.id)}
                  className="btn-secondary py-1 px-2.5 text-xs hover:text-rose-500 flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
