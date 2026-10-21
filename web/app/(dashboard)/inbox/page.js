'use client';
import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { useInbox } from '../../../hooks/useInbox';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { api } from '../../../lib/api';
import { extractVerificationCode, formatTimeAgo } from '../../../lib/helpers';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  StarIcon as StarIconSolid,
  TrashIcon,
  EnvelopeOpenIcon,
  FunnelIcon,
  PaperClipIcon,
  ShieldExclamationIcon,
  KeyIcon
} from '@heroicons/react/24/solid';
import { StarIcon as StarIconOutline } from '@heroicons/react/24/outline';

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
];

function getAvatarColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export default function InboxPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, unread, starred, spam
  const [selectedAlias, setSelectedAlias] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);

  // Fetch aliases for filter dropdown
  const { data: aliasesData } = useSWR('filter-aliases', () => api.getAliases({ limit: 50 }));
  const aliasesList = aliasesData?.aliases || [];

  const inboxParams = useMemo(() => ({
    unread: filter === 'unread' ? 'true' : undefined,
    starred: filter === 'starred' ? 'true' : undefined,
    alias: selectedAlias || undefined,
    q: search || undefined
  }), [filter, selectedAlias, search]);

  const {
    emails,
    total,
    page,
    limit,
    isLoading,
    error,
    refresh,
    nextPage,
    prevPage,
    setParams,
    handleNewEmail
  } = useInbox(inboxParams);

  // Sync params when filters change
  const applyFilter = (f) => {
    setFilter(f);
    setSelectedIds(new Set());
    setParams(p => ({
      ...p,
      page: 1,
      unread: f === 'unread' ? 'true' : undefined,
      starred: f === 'starred' ? 'true' : undefined
    }));
  };

  const applyAliasFilter = (alias) => {
    setSelectedAlias(alias);
    setSelectedIds(new Set());
    setParams(p => ({ ...p, page: 1, alias: alias || undefined }));
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSelectedIds(new Set());
    setParams(p => ({ ...p, page: 1, q: search }));
  };

  const clearSearch = () => {
    setSearch('');
    setSelectedIds(new Set());
    setParams(p => ({ ...p, page: 1, q: undefined }));
  };

  const handleWs = useCallback((msg) => {
    handleNewEmail(msg);
  }, [handleNewEmail]);

  useWebSocket(handleWs);

  const totalPages = Math.ceil(total / limit) || 1;

  // Toggle selection
  const toggleSelectOne = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === emails.length && emails.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map(e => e.id)));
    }
  };

  // Bulk actions
  const handleBulkRead = async () => {
    if (!selectedIds.size) return;
    setIsBulkActing(true);
    try {
      await Promise.all([...selectedIds].map(id => api.markRead(id)));
      toast.success(`Marked ${selectedIds.size} emails as read`);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error('Failed to update emails');
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected emails?`)) return;
    setIsBulkActing(true);
    try {
      await Promise.all([...selectedIds].map(id => api.deleteEmail(id)));
      toast.success(`Deleted ${selectedIds.size} emails`);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error('Failed to delete emails');
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleToggleStar = async (emailId, currentStarred, e) => {
    e.stopPropagation();
    try {
      await api.starEmail(emailId, !currentStarred);
      refresh();
      toast.success(currentStarred ? 'Removed from starred' : 'Starred email');
    } catch (err) {
      toast.error('Failed to star email');
    }
  };

  const handleQuickDelete = async (emailId, e) => {
    e.stopPropagation();
    try {
      await api.deleteEmail(emailId);
      toast.success('Email deleted');
      refresh();
    } catch (err) {
      toast.error('Failed to delete email');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      {/* Top Action & Filter Bar */}
      <div className="bg-white dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700/70 px-4 sm:px-6 py-3.5 space-y-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Mail' },
              { id: 'unread', label: 'Unread' },
              { id: 'starred', label: 'Starred' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => applyFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filter === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span className="ml-2 text-xs font-semibold text-slate-400">
              {total} {total === 1 ? 'message' : 'messages'}
            </span>
          </div>

          {/* Search & Refresh */}
          <div className="flex items-center gap-2">
            {/* Alias Filter Dropdown */}
            {aliasesList.length > 0 && (
              <select
                value={selectedAlias}
                onChange={(e) => applyAliasFilter(e.target.value)}
                className="input py-1.5 px-3 text-xs w-44 hidden md:block"
              >
                <option value="">All Aliases</option>
                {aliasesList.map(a => (
                  <option key={a.address} value={a.address}>
                    {a.address}
                  </option>
                ))}
              </select>
            )}

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search subject, sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input py-1.5 pl-8 pr-7 text-xs"
              />
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="p-1 text-slate-400 hover:text-slate-600 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </form>

            <button
              onClick={refresh}
              className="btn-secondary py-1.5 px-2.5 text-xs"
              title="Refresh inbox"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Bulk Action Bar (When items are selected) */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl px-4 py-2 animate-fade-in text-xs">
            <div className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-200">
              <span>{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline text-[11px]"
              >
                Clear
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkRead}
                disabled={isBulkActing}
                className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5"
              >
                <EnvelopeOpenIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Mark Read</span>
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkActing}
                className="btn-danger py-1 px-2.5 text-xs flex items-center gap-1.5"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Email List Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {/* Select All Checkbox Row */}
        {emails.length > 0 && (
          <div className="bg-slate-50/70 dark:bg-slate-800/40 px-4 sm:px-6 py-2 flex items-center gap-3 text-xs text-slate-500 font-medium">
            <input
              type="checkbox"
              checked={selectedIds.size === emails.length && emails.length > 0}
              onChange={toggleSelectAll}
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Select all visible messages</span>
          </div>
        )}

        {isLoading ? (
          // Skeleton loader
          [...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4 animate-pulse">
              <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="w-9 h-9 bg-slate-200 dark:bg-slate-700 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
              </div>
              <div className="w-16 h-3 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          ))
        ) : emails.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-80 px-4 text-center">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl flex items-center justify-center text-3xl mb-4 border border-indigo-100 dark:border-indigo-900/40 shadow-inner">
              📬
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
              Your inbox is clear
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5">
              {search
                ? `No emails matched your query "${search}". Try searching for something else.`
                : 'Share any of your temporary email aliases to receive emails and verification codes in real time.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/aliases')}
                className="btn-primary py-2 px-4 text-xs"
              >
                View & Copy Aliases
              </button>
              <button
                onClick={refresh}
                className="btn-secondary py-2 px-4 text-xs"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          // List of emails
          emails.map((e) => {
            const otp = extractVerificationCode(e.subject, e.text_body);
            const isSelected = selectedIds.has(e.id);
            const senderInitial = (e.sender_name || e.sender || '?')[0].toUpperCase();
            const avatarStyle = getAvatarColor(e.sender || '');
            const timeStr = formatTimeAgo(e.received_at);

            return (
              <div
                key={e.id}
                onClick={() => router.push(`/inbox/${e.id}`)}
                className={`group flex items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                    : !e.is_read
                    ? 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750'
                    : 'bg-slate-50/40 dark:bg-slate-850/40 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {/* Checkbox */}
                <div
                  onClick={(ev) => toggleSelectOne(e.id, ev)}
                  className="pt-1 sm:pt-0"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Unread indicator */}
                <div className="pt-2 sm:pt-0">
                  <span
                    className={`w-2 h-2 rounded-full block ${
                      !e.is_read ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-transparent'
                    }`}
                  />
                </div>

                {/* Sender Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${avatarStyle}`}
                >
                  {senderInitial}
                </div>

                {/* Email Core Info */}
                <div className="flex-1 min-w-0">
                  {/* Sender & Recipient Bar */}
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-xs truncate ${
                          !e.is_read
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {e.sender_name || e.sender}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate hidden md:inline">
                        → {e.alias_address}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {timeStr}
                      </span>
                    </div>
                  </div>

                  {/* Subject & OTP badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm truncate ${
                        !e.is_read
                          ? 'font-semibold text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {e.subject || '(no subject)'}
                    </span>

                    {/* Detected Verification Code Tag */}
                    {otp && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md shadow-2xs">
                        <KeyIcon className="w-3 h-3 text-amber-500" />
                        <span>OTP: {otp}</span>
                      </span>
                    )}

                    {e.spam_classification !== 'ham' && (
                      <span className="badge-yellow text-[10px] py-0 px-1.5">Spam</span>
                    )}

                    {e.has_attachments > 0 && (
                      <PaperClipIcon className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>

                  {/* Snippet preview */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {e.text_body || 'No text preview available'}
                  </p>
                </div>

                {/* Hover Quick Action Buttons */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 transition-opacity">
                  <button
                    onClick={(ev) => handleToggleStar(e.id, Boolean(e.is_starred), ev)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title={e.is_starred ? 'Unstar' : 'Star'}
                  >
                    {e.is_starred ? (
                      <StarIconSolid className="w-4 h-4 text-amber-400" />
                    ) : (
                      <StarIconOutline className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={(ev) => handleQuickDelete(e.id, ev)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Delete email"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-200/80 dark:border-slate-700/70 bg-white dark:bg-slate-800/90 text-xs text-slate-500 flex-shrink-0">
          <span>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={prevPage}
              disabled={page <= 1}
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={nextPage}
              disabled={page >= totalPages}
              className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
