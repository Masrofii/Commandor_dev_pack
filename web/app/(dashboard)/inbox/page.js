'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { useInbox } from '../../../hooks/useInbox';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { api } from '../../../lib/api';
import { extractVerificationCode, formatBytes, formatTimeAgo, detectServiceAndCategory, summarizeEmail } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  StarIcon as StarIconSolid,
  TrashIcon,
  EnvelopeOpenIcon,
  EnvelopeIcon,
  PaperClipIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  KeyIcon,
  ArrowUturnLeftIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconFilled } from '@heroicons/react/24/solid';

const AVATAR_COLORS = [
  'bg-brand-100 text-brand-700 dark:bg-brand-950/70 dark:text-sky-300 border-brand-200 dark:border-brand-800',
  'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'bg-brand-100 text-brand-700 dark:bg-brand-950/70 dark:text-brand-300 border-brand-200 dark:border-brand-800',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800'
];

function getAvatarColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export default function InboxPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, unread, starred, spam
  const [selectedAlias, setSelectedAlias] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeEmailId, setActiveEmailId] = useState(null);
  const [isBulkActing, setIsBulkActing] = useState(false);

  // Detail pane state
  const [activeTab, setActiveTab] = useState('html'); // 'html' | 'text'
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [copiedOtp, setCopiedOtp] = useState(false);

  // Fetch aliases for filter dropdown
  const { data: aliasesData } = useSWR('filter-aliases', () => api.getAliases({ limit: 100 }));
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

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    refresh();
  };

  const clearSearch = () => {
    setSearch('');
  };

  const applyFilter = (f) => {
    setFilter(f);
  };

  const applyAliasFilter = (val) => {
    setSelectedAlias(val);
  };

  // Detail email fetching
  const { data: activeEmailData, isLoading: loadingActiveEmail, mutate: mutateActiveEmail } = useSWR(
    activeEmailId ? `email-detail-${activeEmailId}` : null,
    () => api.getEmail(activeEmailId)
  );

  // Select first email automatically on desktop when emails load
  useEffect(() => {
    if (!activeEmailId && emails.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setActiveEmailId(emails[0].id);
    }
  }, [emails, activeEmailId]);

  const handleWs = useCallback((msg) => {
    handleNewEmail(msg);
    if (msg.type === 'email.received' && msg.data?.email) {
      // If no email selected on desktop, select it
      if (!activeEmailId && typeof window !== 'undefined' && window.innerWidth >= 1024) {
        setActiveEmailId(msg.data.email.id);
      }
    }
  }, [handleNewEmail, activeEmailId]);

  useWebSocket(handleWs);

  const totalPages = Math.ceil(total / limit) || 1;

  const handleSelectEmail = (id) => {
    setActiveEmailId(id);
    setShowReply(false);
    setReplyText('');
    // Mark as read in background
    api.markRead(id).catch(() => {});
  };

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
    if (selectedIds.size === emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map(e => e.id)));
    }
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.size) return;
    setIsBulkActing(true);
    try {
      const ids = Array.from(selectedIds);
      if (action === 'delete') {
        if (!confirm(`Permanently delete ${ids.length} selected message(s)?`)) {
          setIsBulkActing(false);
          return;
        }
        await Promise.all(ids.map(id => api.deleteEmail(id)));
        toast.success(`Deleted ${ids.length} email(s)`);
        if (selectedIds.has(activeEmailId)) {
          setActiveEmailId(null);
        }
      } else if (action === 'read') {
        await Promise.all(ids.map(id => api.markRead(id)));
        toast.success(`Marked ${ids.length} email(s) as read`);
      }
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error(err.message || 'Bulk operation failed');
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleToggleStar = async (emailId, currentStarred, e) => {
    if (e) e.stopPropagation();
    try {
      await api.starEmail(emailId, !currentStarred);
      refresh();
      if (activeEmailId === emailId) {
        mutateActiveEmail();
      }
      toast.success(!currentStarred ? 'Starred' : 'Unstarred');
    } catch {
      toast.error('Failed to update star status');
    }
  };

  const handleDeleteActiveEmail = async () => {
    if (!activeEmailData) return;
    if (!confirm('Are you sure you want to delete this email?')) return;
    try {
      await api.deleteEmail(activeEmailData.id);
      toast.success('Email deleted');
      setActiveEmailId(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to delete email');
    }
  };

  const handleCopyOtp = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedOtp(true);
    toast.success('Verification code copied!');
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !activeEmailData) return;
    setSendingReply(true);
    try {
      await api.sendReply(activeEmailData.id, replyText);
      toast.success('Reply sent successfully!');
      setReplyText('');
      setShowReply(false);
    } catch (err) {
      toast.error(err.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const activeOtp = activeEmailData ? extractVerificationCode(activeEmailData.subject, activeEmailData.text_body) : null;
  const activeInfo = activeEmailData ? detectServiceAndCategory(activeEmailData.sender, activeEmailData.subject, activeEmailData.text_body) : null;
  const activeSummary = activeEmailData ? summarizeEmail(activeEmailData.subject, activeEmailData.text_body) : '';

  return (
    <div className="h-[calc(100vh-3.75rem)] flex flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-cyber-950 font-sans">
      {/* LEFT PANE: Email List */}
      <div className={`w-full lg:w-[420px] xl:w-[460px] flex-shrink-0 flex flex-col border-r border-slate-200/90 dark:border-cyber-800 bg-white dark:bg-cyber-900 ${activeEmailId ? 'hidden lg:flex' : 'flex'}`}>
        {/* List Header & Search */}
        <div className="p-4 border-b border-slate-100 dark:border-cyber-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('nav.inbox', 'Inbox')}
              </h1>
              <span className="badge-cyan text-xs">
                {total} {t('common.all', 'messages')}
              </span>
            </div>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
              title={t('common.refresh', 'Refresh messages')}
            >
              <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 rtl:left-auto rtl:right-3" />
            <input
              type="text"
              placeholder={t('inbox.search_placeholder', 'Search sender, subject, content...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 rtl:pl-3 rtl:pr-9 pr-8 text-xs py-2 bg-slate-50 dark:bg-cyber-950"
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: 'all', label: t('common.all', 'All') },
              { id: 'unread', label: t('inbox.filter_unread', 'Unread') },
              { id: 'starred', label: t('inbox.filter_starred', 'Starred') }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => applyFilter(f.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filter === f.id
                    ? 'bg-brand-700 dark:bg-sky-700 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-cyber-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-cyber-700'
                }`}
              >
                {f.label}
              </button>
            ))}

            {/* Filter by Alias Dropdown */}
            {aliasesList.length > 0 && (
              <select
                value={selectedAlias}
                onChange={(e) => applyAliasFilter(e.target.value)}
                className="text-xs bg-slate-100 dark:bg-cyber-800 text-slate-700 dark:text-slate-300 rounded-lg px-2.5 py-1 border-0 focus:ring-1 focus:ring-brand-500 max-w-[130px] truncate"
              >
                <option value="">{t('common.all', 'All Aliases')}</option>
                {aliasesList.map(a => (
                  <option key={a.address} value={a.address}>{a.address}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-brand-50/80 dark:bg-cyber-850 px-4 py-2 border-b border-brand-100 dark:border-cyber-700 flex items-center justify-between text-xs animate-fade-in">
            <span className="font-semibold text-brand-900 dark:text-sky-300">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkAction('read')}
                disabled={isBulkActing}
                className="btn bg-white dark:bg-cyber-900 text-slate-700 dark:text-slate-200 py-1 px-2.5 text-xs border border-slate-200 dark:border-cyber-700"
              >
                Mark Read
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                disabled={isBulkActing}
                className="btn bg-rose-600 text-white py-1 px-2.5 text-xs"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Select All Row */}
        {emails.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/60 dark:bg-cyber-950/40 border-b border-slate-100 dark:border-cyber-800/60 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === emails.length && emails.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-slate-300 dark:border-cyber-700 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <span>Select all visible</span>
            </label>
            <span>Showing {emails.length} of {total}</span>
          </div>
        )}

        {/* Scrollable Email List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-cyber-800/70">
          {isLoading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                <div className="w-4 h-4 bg-slate-200 dark:bg-cyber-800 rounded" />
                <div className="w-9 h-9 bg-slate-200 dark:bg-cyber-800 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 dark:bg-cyber-800 rounded w-2/3" />
                </div>
              </div>
            ))
          ) : emails.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-brand-100 dark:border-cyber-800">
                📬
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {search ? t('common.no_results', 'No emails found') : t('inbox.empty_inbox', 'Your inbox is empty')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {search ? t('common.no_results', `No messages matched "${search}"`) : t('inbox.empty_desc', 'Incoming emails received on your aliases and subdomains will appear here in real-time.')}
              </p>
            </div>
          ) : (
            emails.map((e) => {
              const { service, category, otp } = detectServiceAndCategory(e.sender, e.subject, e.text_body);
              const isSelected = selectedIds.has(e.id);
              const isActive = activeEmailId === e.id;
              const senderInitial = (e.sender_name || e.sender || '?')[0].toUpperCase();
              const avatarStyle = getAvatarColor(e.sender || '');
              const timeStr = formatTimeAgo(e.received_at);

              return (
                <div
                  key={e.id}
                  onClick={() => handleSelectEmail(e.id)}
                  className={`p-3.5 sm:p-4 cursor-pointer transition-all flex items-start gap-3 border-l-4 ${
                    isActive
                      ? 'border-brand-600 dark:border-sky-500 bg-brand-50/60 dark:bg-cyber-850'
                      : !e.is_read
                      ? 'border-transparent bg-white dark:bg-cyber-900 hover:bg-slate-50 dark:hover:bg-cyber-850/40 font-semibold'
                      : 'border-transparent bg-slate-50/30 dark:bg-cyber-900/60 hover:bg-slate-50 dark:hover:bg-cyber-850/40'
                  }`}
                >
                  {/* Selection Checkbox */}
                  <div onClick={(ev) => toggleSelectOne(e.id, ev)} className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-slate-300 dark:border-cyber-700 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </div>

                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 border ${avatarStyle}`}>
                    {senderInitial}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-xs truncate ${!e.is_read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                        {e.sender_name || e.sender}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">
                        {timeStr}
                      </span>
                    </div>

                    <div className="text-xs truncate mb-1 text-slate-800 dark:text-slate-200">
                      {e.subject || '(no subject)'}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                        to {e.alias_address}
                      </span>

                      {service && (
                        <span className="badge-indigo text-[10px] py-0 px-1.5 font-semibold">
                          {service}
                        </span>
                      )}

                      {otp && (
                        <span className="badge-cyan text-[10px] py-0 px-1.5 font-mono font-bold">
                          OTP: {otp}
                        </span>
                      )}

                      {category === 'security' && (
                        <span className="badge-red text-[9px] py-0 px-1 font-semibold">Security</span>
                      )}

                      {category === 'receipt' && (
                        <span className="badge-green text-[9px] py-0 px-1 font-semibold">Receipt</span>
                      )}

                      {category === 'newsletter' && (
                        <span className="badge-gray text-[9px] py-0 px-1 font-semibold">Newsletter</span>
                      )}

                      {e.spam_classification === 'spam' && (
                        <span className="badge-red text-[9px] py-0 px-1">Spam</span>
                      )}
                    </div>
                  </div>

                  {/* Star Button */}
                  <button
                    onClick={(ev) => handleToggleStar(e.id, Boolean(e.is_starred), ev)}
                    className="p-1 text-slate-400 hover:text-amber-400 transition-colors flex-shrink-0"
                    title={e.is_starred ? 'Unstar' : 'Star'}
                  >
                    {e.is_starred ? (
                      <StarIconFilled className="w-4 h-4 text-amber-400" />
                    ) : (
                      <StarIconSolid className="w-4 h-4 opacity-40 hover:opacity-100" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Toolbar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 dark:border-cyber-800 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-cyber-900">
            <span className="text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={prevPage}
                disabled={page <= 1}
                className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={nextPage}
                disabled={page >= totalPages}
                className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANE: Reading Pane */}
      <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-cyber-950 overflow-y-auto ${activeEmailId ? 'flex' : 'hidden lg:flex'}`}>
        {activeEmailId && activeEmailData ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Reading Pane Header Bar */}
            <div className="p-4 sm:p-5 border-b border-slate-200/90 dark:border-cyber-800 bg-white dark:bg-cyber-900 flex-shrink-0 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveEmailId(null)}
                  className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-cyber-800"
                  title="Back to inbox list"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Reading Pane
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleStar(activeEmailData.id, Boolean(activeEmailData.is_starred))}
                  className="btn-secondary py-1.5 px-3 text-xs"
                  title={activeEmailData.is_starred ? 'Unstar' : 'Star'}
                >
                  {activeEmailData.is_starred ? (
                    <StarIconFilled className="w-4 h-4 text-amber-400" />
                  ) : (
                    <StarIconSolid className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{activeEmailData.is_starred ? 'Starred' : 'Star'}</span>
                </button>

                <button
                  onClick={() => setShowReply(!showReply)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  <ArrowUturnLeftIcon className="w-4 h-4 text-brand-500" />
                  <span className="hidden sm:inline">Reply</span>
                </button>

                <button
                  onClick={handleDeleteActiveEmail}
                  className="btn-secondary text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 py-1.5 px-3 text-xs"
                  title="Delete message"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>

                <button
                  onClick={() => router.push(`/inbox/${activeEmailData.id}`)}
                  className="btn-secondary py-1.5 px-2.5 text-xs"
                  title="Open in standalone page"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </button>

                <a
                  href={`/api/emails/${activeEmailData.id}/eml`}
                  download={`email-${activeEmailData.id}.eml`}
                  className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 text-slate-700 dark:text-slate-300"
                  title="Download Raw EML"
                >
                  <DocumentArrowDownIcon className="w-4 h-4 text-sky-500" />
                  <span className="hidden md:inline font-mono">EML</span>
                </a>
              </div>
            </div>

            {/* Email Core Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
              {/* Subject Title */}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                  {activeEmailData.subject || '(no subject)'}
                </h1>

                {/* Sender & Metadata Bar */}
                <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200/80 dark:border-cyber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-cyber-800 flex items-center justify-center font-bold text-sm text-brand-700 dark:text-sky-300 border border-brand-200 dark:border-cyber-700">
                      {(activeEmailData.sender_name || activeEmailData.sender || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {activeEmailData.sender_name ? `${activeEmailData.sender_name} <${activeEmailData.sender}>` : activeEmailData.sender}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Delivered to: <code className="text-brand-600 dark:text-sky-400 font-mono">{activeEmailData.alias_address}</code>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-slate-500 font-medium">
                    <div>{new Date(activeEmailData.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-[11px] text-slate-400">{new Date(activeEmailData.received_at).toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Authentication Results & Delivery Details */}
                <div className="mt-2 px-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400 font-medium">Authentication:</span>
                    <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                      activeEmailData.spf_result === 'pass'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-cyber-850 dark:text-slate-400 border border-slate-200 dark:border-cyber-700'
                    }`}>
                      SPF: {activeEmailData.spf_result || 'none'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                      activeEmailData.dkim_result === 'pass'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-cyber-850 dark:text-slate-400 border border-slate-200 dark:border-cyber-700'
                    }`}>
                      DKIM: {activeEmailData.dkim_result || 'none'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                      activeEmailData.dmarc_result === 'pass'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-cyber-850 dark:text-slate-400 border border-slate-200 dark:border-cyber-700'
                    }`}>
                      DMARC: {activeEmailData.dmarc_result || 'none'}
                    </span>
                  </div>

                  {activeEmailData.message_id && (
                    <div className="text-slate-400 flex items-center gap-1 text-[10px] font-mono">
                      <span>ID:</span>
                      <span className="truncate max-w-[180px] sm:max-w-[240px]">{activeEmailData.message_id}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(activeEmailData.message_id);
                          toast.success('Message-ID copied!');
                        }}
                        className="p-0.5 hover:text-brand-500 text-slate-400"
                        title="Copy Message-ID"
                      >
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Detected Verification Code Banner */}
              {activeOtp && (
                <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 flex items-center justify-between gap-4 animate-fade-in shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center">
                      <KeyIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-sky-900 dark:text-sky-300 uppercase tracking-wider block">
                        Verification Code Detected
                      </span>
                      <span className="text-xl sm:text-2xl font-mono font-extrabold text-sky-900 dark:text-white tracking-widest">
                        {activeOtp}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyOtp(activeOtp)}
                    className="btn bg-sky-700 hover:bg-sky-600 text-white py-2 px-3.5 text-xs font-semibold shadow-sm"
                  >
                    {copiedOtp ? (
                      <>
                        <ClipboardDocumentCheckIcon className="w-4 h-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon className="w-4 h-4" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Smart Summary Card */}
              {activeSummary && (
                <div className="p-3.5 rounded-xl bg-brand-50/80 dark:bg-cyber-900 border border-brand-100 dark:border-cyber-800 text-xs space-y-1 shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-brand-700 dark:text-sky-400">
                    <span>✨ Smart Summary</span>
                    {activeInfo?.service && (
                      <span className="text-[10px] px-2 py-0.5 bg-brand-100 dark:bg-cyber-800 text-brand-800 dark:text-sky-300 rounded-md font-semibold">
                        Service: {activeInfo.service}
                      </span>
                    )}
                    {activeInfo?.expiresEstimate && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        Valid: {activeInfo.expiresEstimate}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {activeSummary}
                  </p>
                </div>
              )}

              {/* Suspicious Message Risk Banner */}
              {activeEmailData.spam_classification === 'spam' && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                  <ShieldExclamationIcon className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Suspicious Message Warning (Spam Score: {activeEmailData.spam_score || 'High'}):</span>
                    <span className="ml-1">This email failed sender reputation checks or contains atypical authentication headers. Do not click unrecognized links or provide sensitive credentials.</span>
                  </div>
                </div>
              )}

              {/* Quick Reply Drawer */}
              {showReply && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ArrowUturnLeftIcon className="w-4 h-4 text-brand-500" />
                      <span>Reply to {activeEmailData.sender}</span>
                    </span>
                    <button
                      onClick={() => setShowReply(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Write your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="input font-sans text-xs bg-white dark:bg-cyber-950"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowReply(false)}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold"
                    >
                      {sendingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}

              {/* View Switcher Tabs (HTML / Text) */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('html')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'html'
                        ? 'bg-brand-50 dark:bg-cyber-850 text-brand-700 dark:text-sky-400 font-semibold border border-brand-100 dark:border-cyber-700'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Formatted HTML
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'text'
                        ? 'bg-brand-50 dark:bg-cyber-850 text-brand-700 dark:text-sky-400 font-semibold border border-brand-100 dark:border-cyber-700'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Raw Plain Text
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                  <span>Sanitized & Screened</span>
                </div>
              </div>

              {/* Rendered Body */}
              <div className="min-h-[240px] text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {activeTab === 'html' && activeEmailData.clean_html ? (
                  <div
                    className="prose dark:prose-invert max-w-none break-words"
                    dangerouslySetInnerHTML={{ __html: activeEmailData.clean_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-slate-50 dark:bg-cyber-900 p-4 rounded-xl border border-slate-200/80 dark:border-cyber-800 text-slate-800 dark:text-slate-200 overflow-x-auto">
                    {activeEmailData.text_body || 'No text content available in this email message.'}
                  </pre>
                )}
              </div>

              {/* Attachments Section */}
              {activeEmailData.attachments && activeEmailData.attachments.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-cyber-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <PaperClipIcon className="w-4 h-4 text-brand-500" />
                    <span>Attachments ({activeEmailData.attachments.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeEmailData.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {att.safe_filename || att.filename}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{formatBytes(att.size)}</span>
                            <span>•</span>
                            <span className="text-emerald-500">Scan: {att.scan_status}</span>
                          </div>
                        </div>
                        <a
                          href={api.getAttachmentUrl(att.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary py-1 px-2.5 text-xs font-semibold flex-shrink-0"
                        >
                          <DocumentArrowDownIcon className="w-4 h-4 text-brand-500" />
                          <span>Download</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty reading pane state */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 flex items-center justify-center text-3xl">
              ✉️
            </div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {t('inbox.select_message', 'Select an email to read')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              {t('inbox.select_desc', 'Choose a message from the list on the left to inspect full headers, HTML formatting, and attachments.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
