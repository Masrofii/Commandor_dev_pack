'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import {
  PlusIcon,
  FireIcon,
  TrashIcon,
  QrCodeIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  PauseIcon,
  PlayIcon,
  XMarkIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

export default function AliasesPage() {
  const { data, isLoading, mutate } = useSWR('aliases-list', () => api.getAliases({ limit: 150 }));
  const { data: domainsData } = useSWR('domains-list', () => api.getDomains());

  const [showCreate, setShowCreate] = useState(false);
  const [selDomain, setSelDomain] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customName, setCustomName] = useState('');
  const [createCount, setCreateCount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // all, active, paused, burner, custom
  const [qrModalAlias, setQrModalAlias] = useState(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState(false);
  const [qrFormat, setQrFormat] = useState('mailto');
  const [deleteConfirmAlias, setDeleteConfirmAlias] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const aliases = data?.aliases || [];
  const domains = domainsData?.domains || [];

  const handleCreateAlias = async (isBurner = false) => {
    const domain = selDomain || domains[0] || 'commandor.my.id';
    setCreating(true);
    try {
      if (isBurner) {
        const b = await api.createBurner(domain);
        toast.success(`1-Hour Burner created:\n${b.address}`, { duration: 5000 });
      } else if (createCount > 1) {
        let createdNum = 0;
        for (let i = 0; i < createCount; i++) {
          const lbl = customLabel.trim() ? `${customLabel.trim()} #${i + 1}` : undefined;
          await api.createAlias({ domain, label: lbl });
          createdNum++;
        }
        toast.success(`Successfully generated ${createdNum} aliases!`, { duration: 5000 });
      } else {
        const a = await api.createAlias({
          domain,
          label: customLabel.trim() || undefined,
          customName: customName.trim() || undefined
        });
        toast.success(`Alias created:\n${a.address}`, { duration: 4000 });
      }
      mutate();
      setShowCreate(false);
      setCustomLabel('');
      setCustomName('');
      setCreateCount(1);
    } catch (err) {
      toast.error(err.message || 'Failed to create alias');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmAlias) return;
    setDeleting(true);
    try {
      await api.deleteAlias(deleteConfirmAlias);
      toast.success('Alias deleted successfully');
      setDeleteConfirmAlias(null);
      mutate();
    } catch (err) {
      toast.error(err.message || 'Failed to delete alias');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (address, currentActive) => {
    try {
      await api.bulkAliasAction([address], currentActive ? 'deactivate' : 'activate');
      toast.success(currentActive ? 'Alias paused' : 'Alias activated');
      mutate();
    } catch (err) {
      toast.error('Failed to update alias status');
    }
  };

  const handleBulkAction = async (action) => {
    if (!selected.size) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} selected aliases?`)) return;
    try {
      await api.bulkAliasAction([...selected], action);
      toast.success(`Updated ${selected.size} aliases`);
      setSelected(new Set());
      mutate();
    } catch (err) {
      toast.error('Bulk action failed');
    }
  };

  const handleCopy = async (address) => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Filtered Aliases
  const filteredAliases = aliases.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      const matchAddress = a.address.toLowerCase().includes(q);
      const matchLabel = a.label && a.label.toLowerCase().includes(q);
      if (!matchAddress && !matchLabel) return false;
    }
    if (filterActive === 'active' && !a.active) return false;
    if (filterActive === 'paused' && a.active) return false;
    if (filterActive === 'burner' && !a.burner) return false;
    if (filterActive === 'custom' && !(a.alias_type === 'custom' || a.address.includes('-ca@'))) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Email Aliases
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, manage, and monitor your private temporary and custom email addresses
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCreateAlias(true)}
            disabled={creating}
            className="btn bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs py-2 px-3.5 shadow-sm font-semibold"
          >
            <FireIcon className="w-4 h-4 text-rose-500" />
            <span>1-Hour Burner</span>
          </button>

          <button
            onClick={() => setShowCreate((v) => !v)}
            className="btn-primary py-2 px-3.5 text-xs shadow-sm font-semibold"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Alias</span>
          </button>
        </div>
      </div>

      {/* Create Alias Modal/Card */}
      {showCreate && (
        <div className="card p-5 sm:p-6 border-indigo-200 dark:border-cyber-800 shadow-md animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-indigo-500" />
              <span>Generate New Email Alias</span>
            </h3>
            <button
              onClick={() => setShowCreate(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Domain
              </label>
              <select
                value={selDomain}
                onChange={(e) => setSelDomain(e.target.value)}
                className="input text-xs"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    @{d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Custom Name (e.g. <code>github</code> ➔ <code>github-ca</code>)
              </label>
              <input
                type="text"
                placeholder="Leave blank for random uuid"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="input text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Label / Tag (Personal, Work, Trial)
              </label>
              <input
                type="text"
                placeholder="e.g. Personal, Work, Trial"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="input text-xs"
              />
            </div>
          </div>

          {/* Quick preset tags */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="text-[11px] text-slate-400">Quick Tags:</span>
            {['Personal', 'Work', 'Newsletter', 'Trial', 'Shopping'].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setCustomLabel(tag)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-cyber-850 hover:bg-slate-200 dark:hover:bg-cyber-700 text-slate-600 dark:text-slate-300 font-medium transition-colors"
              >
                +{tag}
              </button>
            ))}
          </div>

          {/* Batch / Quantity selector */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400 font-semibold">Quantity:</span>
            {[1, 5, 10, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCreateCount(num)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                  createCount === num
                    ? 'border-indigo-600 dark:border-cyan-500 bg-indigo-50 dark:bg-cyan-950/60 text-indigo-700 dark:text-cyan-300'
                    : 'border-slate-200 dark:border-cyber-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-cyber-800'
                }`}
              >
                {num === 1 ? 'Single (1)' : `Bulk (${num}x)`}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-cyber-800">
            <button
              onClick={() => setShowCreate(false)}
              className="btn-secondary py-1.5 px-3.5 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreateAlias(false)}
              disabled={creating}
              className="btn-primary py-1.5 px-4 text-xs font-semibold"
            >
              {creating ? 'Generating...' : createCount > 1 ? `Generate ${createCount} Aliases` : 'Generate Alias'}
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: `All (${aliases.length})` },
            { id: 'active', label: 'Active' },
            { id: 'paused', label: 'Paused' },
            { id: 'burner', label: 'Burners 🔥' },
            { id: 'custom', label: 'Custom (-ca)' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterActive(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterActive === tab.id
                  ? 'bg-indigo-600 dark:bg-cyan-600 text-white shadow-sm'
                  : 'bg-white dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-cyber-850'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search address or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-xs py-2 bg-white dark:bg-cyber-900"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-cyber-850 border border-indigo-100 dark:border-cyber-700 flex items-center justify-between text-xs animate-fade-in shadow-sm">
          <span className="font-semibold text-indigo-900 dark:text-cyan-300">
            {selected.size} alias(es) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction('activate')}
              className="btn bg-white dark:bg-cyber-900 text-slate-700 dark:text-slate-200 py-1 px-3 text-xs border border-slate-200 dark:border-cyber-700 font-semibold"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkAction('deactivate')}
              className="btn bg-white dark:bg-cyber-900 text-slate-700 dark:text-slate-200 py-1 px-3 text-xs border border-slate-200 dark:border-cyber-700 font-semibold"
            >
              Pause
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="btn bg-rose-600 text-white py-1 px-3 text-xs font-semibold"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Aliases Table / List */}
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-cyber-800">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-4 h-4 bg-slate-200 dark:bg-cyber-800 rounded" />
                <div className="w-2.5 h-2.5 bg-slate-200 dark:bg-cyber-800 rounded-full" />
                <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-1/3" />
              </div>
              <div className="w-20 h-4 bg-slate-200 dark:bg-cyber-800 rounded" />
            </div>
          ))
        ) : filteredAliases.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-indigo-100 dark:border-cyber-800">
              ✉️
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              No aliases found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {search ? `No aliases matched "${search}"` : 'Create your first email alias or 1-hour burner address to get started.'}
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary py-2 px-4 text-xs font-semibold">
              Generate New Alias
            </button>
          </div>
        ) : (
          filteredAliases.map((a) => {
            const isSelected = selected.has(a.address);
            const isActive = Boolean(a.active);
            const isBurner = Boolean(a.burner);
            const isCustom = a.alias_type === 'custom' || a.address.includes('-ca@');

            return (
              <div
                key={a.address}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-cyber-850'
                    : 'hover:bg-slate-50/70 dark:hover:bg-cyber-850/50'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                  {/* Select Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.address)) next.delete(a.address);
                        else next.add(a.address);
                        return next;
                      });
                    }}
                    className="rounded border-slate-300 dark:border-cyber-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-1 sm:mt-0"
                  />

                  {/* Status Indicator */}
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 sm:mt-0 ${
                      isActive ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    title={isActive ? 'Active' : 'Paused'}
                  />

                  {/* Address and Meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleCopy(a.address)}
                        className="font-mono text-sm font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-cyan-400 truncate text-left transition-colors flex items-center gap-1.5"
                        title="Click to copy address"
                      >
                        <span>{a.address}</span>
                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-500 flex-shrink-0" />
                      </button>

                      {isBurner && (
                        <span className="badge-red text-[10px] py-0 px-2 font-semibold">🔥 1h Burner</span>
                      )}

                      {isCustom && (
                        <span className="badge-cyan text-[10px] py-0 px-2 font-semibold">Protected -ca</span>
                      )}

                      {a.label && (
                        <span className="badge-indigo text-[10px] py-0 px-2 truncate max-w-[120px]">
                          {a.label}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Created {formatTimeAgo(a.created_at)}</span>
                      {a.burner_expires_at && (
                        <>
                          <span>•</span>
                          <span className="text-rose-500 font-medium">
                            Self-destructs at {new Date(a.burner_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Icons */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
                  {/* Renew Expiry button for Burners */}
                  {isBurner && (
                    <button
                      onClick={async () => {
                        try {
                          await api.renewAlias(a.address, 60);
                          toast.success(`Burner renewed for +1 hour!`);
                          mutate();
                        } catch (err) {
                          toast.error(err.message || 'Failed to renew');
                        }
                      }}
                      className="btn-secondary py-1 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900/50"
                      title="Extend self-destruct countdown by 1 hour"
                    >
                      <span>⏳ +1h</span>
                    </button>
                  )}

                  {/* View Inbox Link */}
                  <Link
                    href={`/inbox?alias=${encodeURIComponent(a.address)}`}
                    className="btn-secondary py-1 px-2.5 text-xs font-semibold"
                    title="View emails for this alias"
                  >
                    <InboxIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="hidden md:inline">Inbox</span>
                  </Link>

                  {/* QR Code */}
                  <button
                    onClick={() => {
                      setQrModalAlias(a.address);
                      setQrLoading(true);
                      setQrError(false);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                    title="QR Code"
                  >
                    <QrCodeIcon className="w-4 h-4" />
                  </button>

                  {/* Pause / Resume */}
                  <button
                    onClick={() => handleToggleActive(a.address, Boolean(a.active))}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                    title={a.active ? 'Pause incoming mail' : 'Resume incoming mail'}
                  >
                    {a.active ? (
                      <PauseIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4 text-emerald-500" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirmAlias(a.address)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                    title="Delete alias"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* QR Code Modal */}
      {qrModalAlias && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setQrModalAlias(null)}
        >
          <div
            className="card p-6 max-w-sm w-full text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="text-left">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <QrCodeIcon className="w-4 h-4 text-indigo-500" />
                  Alias QR Code
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Scan with your phone camera to compose or copy</p>
              </div>
              <button onClick={() => setQrModalAlias(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-xl inline-flex items-center justify-center shadow-sm relative min-w-[208px] min-h-[208px] mx-auto">
              {qrLoading && !qrError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 rounded-xl z-10">
                  <ArrowPathIcon className="w-6 h-6 text-indigo-600 animate-spin" />
                  <span className="text-[11px] font-medium text-slate-600 mt-2">Generating QR...</span>
                </div>
              )}
              {qrError ? (
                <div className="p-4 text-center text-rose-500">
                  <p className="text-xs font-semibold mb-2">Failed to load QR code</p>
                  <button
                    onClick={() => { setQrError(false); setQrLoading(true); }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 underline font-medium"
                  >
                    Tap to retry
                  </button>
                </div>
              ) : (
                <img
                  src={api.getAliasQr(qrModalAlias, { format: qrFormat })}
                  alt={`QR code for ${qrModalAlias}`}
                  className={`w-48 h-48 mx-auto object-contain transition-opacity duration-200 ${qrLoading ? 'opacity-0' : 'opacity-100'}`}
                  onLoad={() => setQrLoading(false)}
                  onError={() => { setQrLoading(false); setQrError(true); }}
                />
              )}
            </div>

            {/* Format toggle: mailto vs raw address */}
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Payload:</span>
              <button
                type="button"
                onClick={() => { setQrFormat('mailto'); setQrLoading(true); setQrError(false); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  qrFormat === 'mailto'
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Mailto Link
              </button>
              <button
                type="button"
                onClick={() => { setQrFormat('plain'); setQrLoading(true); setQrError(false); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  qrFormat === 'plain'
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Plain Address
              </button>
            </div>

            <p className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all bg-slate-50 dark:bg-cyber-900/50 p-2 rounded-lg border border-slate-100 dark:border-cyber-800">
              {qrModalAlias}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  handleCopy(qrModalAlias);
                }}
                className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                Copy Address
              </button>
              <a
                href={api.getAliasQr(qrModalAlias, { format: qrFormat })}
                download={`${qrModalAlias}-qr.png`}
                target="_blank"
                rel="noreferrer"
                className="btn-primary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                Download PNG
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAlias && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDeleteConfirmAlias(null)}
        >
          <div
            className="card p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Delete Email Alias?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete <code className="text-rose-600 dark:text-rose-400 font-mono font-bold">{deleteConfirmAlias}</code>? Any incoming emails sent to this address in the future will be rejected.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-cyber-800">
              <button
                onClick={() => setDeleteConfirmAlias(null)}
                className="btn-secondary py-1.5 px-3.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn bg-rose-600 hover:bg-rose-500 text-white py-1.5 px-4 text-xs font-semibold shadow-sm shadow-rose-500/20"
              >
                {deleting ? 'Deleting...' : 'Delete Alias'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
