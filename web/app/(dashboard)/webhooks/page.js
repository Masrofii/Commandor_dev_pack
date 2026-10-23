'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import {
  LinkIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ClockIcon,
  ExclamationCircleIcon,
  EyeIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const EVENTS = [
  'email.received',
  'email.deleted',
  'alias.created',
  'alias.expired',
  'alias.deleted'
];

export default function WebhooksPage() {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useSWR('webhooks', api.getWebhooks);
  const [form, setForm] = useState({
    name: '',
    url: '',
    secret: '',
    eventTypes: ['email.received']
  });
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Deliveries inspection state
  const [inspectWebhook, setInspectWebhook] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  async function openDeliveries(webhook) {
    setInspectWebhook(webhook);
    setLoadingDeliveries(true);
    try {
      const res = await api.getWebhookDeliveries(webhook.id);
      setDeliveries(Array.isArray(res) ? res : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load deliveries');
    } finally {
      setLoadingDeliveries(false);
    }
  }

  async function handleRetryDelivery(deliveryId) {
    setRetryingId(deliveryId);
    try {
      const res = await api.retryWebhookDelivery(inspectWebhook.id, deliveryId);
      if (res.success) {
        toast.success('Webhook delivery retried successfully!');
      } else {
        toast.error(`Webhook retry failed: ${res.delivery?.error || 'HTTP error'}`);
      }
      // Refresh deliveries
      const refreshed = await api.getWebhookDeliveries(inspectWebhook.id);
      setDeliveries(Array.isArray(refreshed) ? refreshed : []);
    } catch (err) {
      toast.error(err.message || 'Retry dispatch failed');
    } finally {
      setRetryingId(null);
    }
  }

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
      if (inspectWebhook?.id === id) setInspectWebhook(null);
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('webhooks.title', 'Webhooks & Real-Time Dispatcher')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('webhooks.subtitle', 'Dispatch HTTP POST requests in real-time with automated exponential retry backoff, HMAC verification, and delivery tracking.')}
          </p>
        </div>

        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn-primary py-2 px-3.5 text-xs shadow-sm flex items-center gap-1.5 self-start"
        >
          <PlusIcon className="w-4 h-4" />
          <span>{t('webhooks.add_btn', 'Add Webhook')}</span>
        </button>
      </div>

      {/* Add Webhook Form */}
      {showAdd && (
        <div className="card p-5 sm:p-6 border-indigo-200 dark:border-indigo-900/80 shadow-md animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('webhooks.modal_title', 'Configure New Webhook')}
            </h3>
            <button
              onClick={() => setShowAdd(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('webhooks.name_label', 'Webhook Name')}
              </label>
              <input
                placeholder={t('webhooks.name_placeholder', 'e.g. Discord Notifier, Zapier Endpoint')}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-cyber w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('webhooks.url_label', 'Payload URL (HTTPS)')}
              </label>
              <input
                placeholder="https://example.com/api/webhooks/incoming"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="input-cyber w-full font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {t('webhooks.secret_label', 'Signing Secret (Optional, for HMAC SHA-256 verification)')}
              </label>
              <input
                placeholder="whsec_..."
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                className="input-cyber w-full font-mono text-xs"
                type="password"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                {t('webhooks.trigger_events', 'Trigger Events')}
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
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={create}
              disabled={!form.name || !form.url || creating}
              className="btn-primary py-1.5 px-4 text-xs font-semibold"
            >
              {creating ? t('webhooks.saving_btn', 'Saving...') : t('webhooks.save_btn', 'Save Webhook')}
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">{t('webhooks.loading', 'Loading webhooks...')}</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center">
            <LinkIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">{t('webhooks.empty_title', 'No webhooks configured')}</h4>
            <p className="text-xs text-slate-400 mt-1">
              {t('webhooks.empty_desc', 'Add a webhook to forward incoming email events or service alerts to external systems.')}
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
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 hover:bg-slate-50/70 dark:hover:bg-slate-750/40 transition-colors gap-3"
              >
                <div className="space-y-1.5 min-w-0 pr-4">
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{w.name}</span>
                    {w.secret && (
                      <span className="badge-cyan text-[10px] font-mono">HMAC Protected</span>
                    )}
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

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    onClick={() => openDeliveries(w)}
                    className="btn-secondary py-1 px-3 text-xs flex items-center gap-1 font-semibold"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    <span>Deliveries &amp; Retries</span>
                  </button>

                  <button
                    onClick={() => del(w.id)}
                    className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex-shrink-0"
                    title="Delete webhook"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DELIVERIES & RETRY INSPECTOR MODAL */}
      {inspectWebhook && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-3xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col border-indigo-200 dark:border-cyber-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ArrowPathIcon className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
                  <span>Webhook Delivery Log &amp; Retry Inspector</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Target: {inspectWebhook.name} ({inspectWebhook.url})
                </p>
              </div>
              <button onClick={() => setInspectWebhook(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1">
              {loadingDeliveries ? (
                <div className="p-8 text-center text-slate-400 font-mono animate-pulse">
                  Loading delivery attempts...
                </div>
              ) : deliveries.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No dispatch attempts recorded for this webhook yet.
                </div>
              ) : (
                deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-cyber-800 bg-slate-50 dark:bg-cyber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                          d.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-300' :
                          d.status === 'retrying' || d.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-300' :
                          'bg-rose-50 text-rose-600 border-rose-300'
                        }`}>
                          {d.status}
                        </span>

                        <span className="badge-cyan text-[10px] font-mono">{d.event_type}</span>

                        <span className="font-mono text-slate-500 text-[11px]">
                          Attempt #{d.attempt_number}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                        {d.http_status && <span>HTTP {d.http_status}</span>}
                        {d.response_time_ms !== null && <span>Latency: {d.response_time_ms}ms</span>}
                        <span>{formatTimeAgo(d.created_at)}</span>
                        {d.next_retry_at && (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            Next Retry: {d.next_retry_at}
                          </span>
                        )}
                      </div>

                      {d.error && (
                        <p className="text-[11px] text-rose-500 font-mono">{d.error}</p>
                      )}
                    </div>

                    <button
                      onClick={() => handleRetryDelivery(d.id)}
                      disabled={retryingId === d.id}
                      className="btn-secondary py-1 px-3 text-xs flex items-center gap-1 self-start sm:self-auto font-semibold"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${retryingId === d.id ? 'animate-spin' : ''}`} />
                      <span>{retryingId === d.id ? 'Retrying...' : 'Retry Now'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-cyber-800">
              <button
                onClick={() => setInspectWebhook(null)}
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
