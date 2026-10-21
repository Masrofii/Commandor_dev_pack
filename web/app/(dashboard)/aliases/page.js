'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
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
  PauseIcon,
  PlayIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

export default function AliasesPage() {
  const { data, isLoading, mutate } = useSWR('aliases-list', () => api.getAliases({ limit: 100 }));
  const { data: domainsData } = useSWR('domains-list', () => api.getDomains());

  const [showCreate, setShowCreate] = useState(false);
  const [selDomain, setSelDomain] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customName, setCustomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // all, active, burner
  const [qrModalAlias, setQrModalAlias] = useState(null);

  const aliases = data?.aliases || [];
  const domains = domainsData?.domains || [];

  const handleCreateAlias = async (isBurner = false) => {
    const domain = selDomain || domains[0];
    if (!domain) {
      toast.error('No domains available');
      return;
    }
    setCreating(true);
    try {
      if (isBurner) {
        const b = await api.createBurner(domain);
        toast.success(`1-Hour Burner created:\n${b.address}`, { duration: 5000 });
      } else {
        const a = await api.createAlias({
          domain,
          label: customLabel || undefined,
          customName: customName.trim() || undefined
        });
        toast.success(`Alias created:\n${a.address}`, { duration: 4000 });
      }
      mutate();
      setShowCreate(false);
      setCustomLabel('');
      setCustomName('');
    } catch (err) {
      toast.error(err.message || 'Failed to create alias');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAlias = async (address) => {
    if (!confirm(`Are you sure you want to delete ${address}?`)) return;
    try {
      await api.deleteAlias(address);
      toast.success('Alias deleted');
      mutate();
    } catch (err) {
      toast.error(err.message || 'Failed to delete alias');
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
    if (search && !a.address.toLowerCase().includes(search.toLowerCase()) && !(a.label && a.label.toLowerCase().includes(search.toLowerCase()))) {
      return false;
    }
    if (filterActive === 'active' && !a.active) return false;
    if (filterActive === 'burner' && !a.burner) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Email Aliases
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, manage, and monitor your private temporary email addresses
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCreateAlias(true)}
            disabled={creating}
            className="btn bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs py-2 px-3.5 shadow-sm"
          >
            <FireIcon className="w-4 h-4 text-rose-500" />
            <span>1-Hour Burner</span>
          </button>

          <button
            onClick={() => setShowCreate((v) => !v)}
            className="btn-primary py-2 px-3.5 text-xs shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Alias</span>
          </button>
        </div>
      </div>

      {/* Create Alias Modal/Card */}
      {showCreate && (
        <div className="card p-5 border-indigo-200 dark:border-indigo-900/80 shadow-md animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Create New Email Alias
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
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Domain
              </label>
              <select
                value={selDomain}
                onChange={(e) => setSelDomain(e.target.value)}
                className="input"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    @{d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Custom Name (e.g. example ➔ example-ca)
              </label>
              <input
                type="text"
                placeholder="Optional (auto-adds -ca)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Label / Purpose (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Netflix, Discord, Trial"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="input"
              />
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
              onClick={() => handleCreateAlias(false)}
              disabled={creating}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              {creating ? 'Generating...' : 'Create Alias'}
            </button>
          </div>
        </div>
      )}

      {/* Filters & Bulk Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'burner', label: 'Burners 🔥' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterActive(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterActive === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="text-xs text-slate-400 font-medium ml-2">
            ({filteredAliases.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-3 py-1 rounded-xl text-xs">
              <span className="font-semibold text-indigo-900 dark:text-indigo-200 mr-1">
                {selected.size} selected
              </span>
              <button
                onClick={() => handleBulkAction('activate')}
                className="hover:underline text-indigo-700 dark:text-indigo-300 text-[11px]"
              >
                Activate
              </button>
              <span>•</span>
              <button
                onClick={() => handleBulkAction('deactivate')}
                className="hover:underline text-amber-700 dark:text-amber-300 text-[11px]"
              >
                Pause
              </button>
              <span>•</span>
              <button
                onClick={() => handleBulkAction('delete')}
                className="hover:underline text-rose-600 dark:text-rose-400 text-[11px]"
              >
                Delete
              </button>
            </div>
          )}

          <input
            type="text"
            placeholder="Filter aliases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input py-1.5 px-3 text-xs w-48 sm:w-56"
          />
        </div>
      </div>

      {/* Aliases List Card */}
      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
            <p className="text-xs">Loading aliases...</p>
          </div>
        ) : filteredAliases.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">
              📧
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No aliases found
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              {search
                ? 'No aliases matched your filter criteria.'
                : 'Get started by creating your first temporary email address.'}
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary py-2 px-4 text-xs"
            >
              + Create Alias
            </button>
          </div>
        ) : (
          filteredAliases.map((a) => {
            const isSelected = selected.has(a.address);
            const isBurner = Boolean(a.burner);
            const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
            const isActive = a.active && !isExpired;

            return (
              <div
                key={a.address}
                className={`group flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 transition-all ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-750/50'
                }`}
              >
                {/* Left check & status */}
                <div className="flex items-center gap-3 min-w-0">
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
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />

                  {/* Active Indicator Dot */}
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isActive
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    title={isActive ? 'Active' : 'Inactive'}
                  />

                  {/* Address & Meta */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleCopy(a.address)}
                        className="font-mono text-sm font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate text-left transition-colors flex items-center gap-1.5"
                        title="Click to copy address"
                      >
                        <span>{a.address}</span>
                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-600 flex-shrink-0 opacity-0 group-hover:opacity-100" />
                      </button>

                      {isBurner && (
                        <span className="badge-red text-[10px] py-0 px-2">🔥 1h Burner</span>
                      )}

                      {a.label && (
                        <span className="badge-gray text-[10px] py-0 px-2 truncate max-w-[120px]">
                          {a.label}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>Created {formatTimeAgo(a.created_at)}</span>
                      {a.burner_expires_at && (
                        <>
                          <span>•</span>
                          <span className="text-rose-500 font-medium">
                            Expires at {new Date(a.burner_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {/* QR Code Button */}
                  <button
                    onClick={() => setQrModalAlias(a.address)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="View QR Code"
                  >
                    <QrCodeIcon className="w-4 h-4" />
                  </button>

                  {/* Toggle Active / Pause */}
                  <button
                    onClick={() => handleToggleActive(a.address, Boolean(a.active))}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title={a.active ? 'Pause incoming mail' : 'Resume incoming mail'}
                  >
                    {a.active ? (
                      <PauseIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4 text-emerald-500" />
                    )}
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteAlias(a.address)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setQrModalAlias(null)}
        >
          <div
            className="card p-6 max-w-sm w-full text-center space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Alias QR Code
              </h3>
              <button
                onClick={() => setQrModalAlias(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-inner inline-block mx-auto border border-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.getAliasQr(qrModalAlias)}
                alt={`QR code for ${qrModalAlias}`}
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 break-all bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
              {qrModalAlias}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(qrModalAlias)}
                className="btn-secondary py-2 flex-1 text-xs"
              >
                Copy Address
              </button>
              <a
                href={api.getAliasQr(qrModalAlias)}
                download={`${qrModalAlias}.png`}
                className="btn-primary py-2 flex-1 text-xs"
              >
                Download PNG
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
