'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '../../../../lib/api';
import { useTranslation } from '../../../../lib/i18n';
import { extractVerificationCode, formatBytes, formatTimeAgo, detectServiceAndCategory, summarizeEmail } from '../../../../lib/helpers';
import {
  ArrowLeftIcon,
  StarIcon as StarIconSolid,
  TrashIcon,
  ArrowUturnLeftIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  PaperClipIcon,
  ShieldExclamationIcon,
  KeyIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/solid';
import { StarIcon as StarIconOutline } from '@heroicons/react/24/outline';

export default function EmailDetailPage({ params }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('html'); // 'html' or 'text'
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    api.getEmail(params.id)
      .then((data) => {
        setEmail(data);
        if (!data.clean_html && data.text_body) {
          setActiveTab('text');
        }
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load email');
        router.back();
      })
      .finally(() => setLoading(false));
  }, [params.id, router]);

  const otpCode = email ? extractVerificationCode(email.subject, email.text_body) : null;
  const info = email ? detectServiceAndCategory(email.sender, email.subject, email.text_body) : null;
  const summary = email ? summarizeEmail(email.subject, email.text_body) : '';

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard!`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleCopyOtp = () => {
    if (!otpCode) return;
    copyToClipboard(otpCode, t('inbox_detail.otp_detected', 'Verification code'));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const toggleStar = async () => {
    if (!email) return;
    const nextStarred = !email.is_starred;
    try {
      await api.starEmail(email.id, nextStarred);
      setEmail((prev) => ({ ...prev, is_starred: nextStarred ? 1 : 0 }));
      toast.success(nextStarred ? 'Email starred' : 'Email unstarred');
    } catch {
      toast.error('Failed to star email');
    }
  };

  const handleDelete = async () => {
    if (!email) return;
    if (!confirm(t('inbox_detail.delete_confirm', 'Are you sure you want to delete this email?'))) return;
    try {
      await api.deleteEmail(email.id);
      toast.success(t('inbox_detail.deleted_toast', 'Email deleted'));
      router.push('/inbox');
    } catch (err) {
      toast.error(err.message || 'Failed to delete email');
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await api.sendReply(email.id, replyText);
      toast.success(t('inbox_detail.reply_sent_toast', 'Reply sent successfully!'));
      setReplyText('');
      setShowReply(false);
    } catch (err) {
      toast.error(err.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4 animate-pulse">
        <div className="h-9 w-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="card p-6 space-y-4">
          <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-64 bg-slate-100 dark:bg-slate-750 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!email) return null;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 pb-16">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => router.push('/inbox')}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>{t('inbox_detail.back_to_inbox', 'Back to Inbox')}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleStar}
            className={`btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 ${
              email.is_starred ? 'text-amber-500 border-amber-300 dark:border-amber-800' : ''
            }`}
          >
            {email.is_starred ? (
              <StarIconSolid className="w-4 h-4 text-amber-400" />
            ) : (
              <StarIconOutline className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{email.is_starred ? t('inbox_detail.starred', 'Starred') : t('inbox_detail.star', 'Star')}</span>
          </button>

          <button
            onClick={() => setShowReply((v) => !v)}
            className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            <span>{t('inbox_detail.reply', 'Reply')}</span>
          </button>

          <button
            onClick={handleDelete}
            className="btn-danger py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('common.delete', 'Delete')}</span>
          </button>

          <a
            href={`/api/emails/${email.id}/eml`}
            download={`email-${email.id}.eml`}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
            title={t('inbox_detail.download_eml', 'Download Raw EML')}
          >
            <DocumentArrowDownIcon className="w-4 h-4 text-cyan-500" />
            <span className="hidden sm:inline font-mono">EML</span>
          </a>
        </div>
      </div>

      {/* Prominent Verification Code / OTP Banner */}
      {otpCode && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border-2 border-amber-400/80 dark:border-amber-500/70 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <div className="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-amber-500/30 flex-shrink-0">
              <KeyIcon className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-amber-800 dark:text-amber-400">
                {t('inbox_detail.otp_detected', 'Verification Code Detected')}
              </span>
              <div className="text-2xl sm:text-3xl font-mono font-black tracking-widest text-slate-900 dark:text-white mt-0.5">
                {otpCode}
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyOtp}
            className="btn bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 px-5 rounded-xl shadow-md shadow-amber-500/25 flex items-center gap-2 text-sm w-full sm:w-auto justify-center active:scale-95"
          >
            {copiedCode ? (
              <>
                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                <span>{t('inbox_detail.copied', 'Copied!')}</span>
              </>
            ) : (
              <>
                <ClipboardDocumentIcon className="w-4 h-4" />
                <span>{t('inbox_detail.copy_code', 'Copy Code')}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Smart Summary Card */}
      {summary && (
        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 dark:bg-cyber-900 border border-indigo-100 dark:border-cyber-800 text-xs space-y-1.5 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-cyan-400">
            <span>✨ AI & Smart Digest</span>
            {info?.service && (
              <span className="text-[10px] px-2 py-0.5 bg-indigo-100 dark:bg-cyber-800 text-indigo-800 dark:text-cyan-300 rounded-md font-semibold">
                Service: {info.service}
              </span>
            )}
            {info?.expiresEstimate && (
              <span className="text-[10px] text-slate-400 font-normal">
                Valid: {info.expiresEstimate}
              </span>
            )}
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans text-sm">
            {summary}
          </p>
        </div>
      )}

      {/* Main Email Card */}
      <div className="card overflow-hidden">
        {/* Email Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-700/80">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {email.subject || '(no subject)'}
          </h1>

          {/* Spam Notice */}
          {email.spam_classification !== 'ham' && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs mb-4">
              <ShieldExclamationIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>
                {t('inbox_detail.spam_warning', 'Spam Warning: This email was flagged by spam filters (Score: {score}). Be cautious with links or instructions.', { score: email.spam_score })}
              </span>
            </div>
          )}

          {/* Sender & Recipient Grid */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 w-12 font-medium">{t('inbox_detail.from', 'From:')}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {email.sender_name ? `${email.sender_name} ` : ''}
                  <span className="font-mono text-slate-600 dark:text-slate-400">&lt;{email.sender}&gt;</span>
                </span>
                <button
                  onClick={() => copyToClipboard(email.sender, 'Sender email')}
                  className="text-slate-400 hover:text-indigo-600 p-0.5"
                  title="Copy sender email"
                >
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 w-12 font-medium">{t('inbox_detail.to', 'To:')}</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                  {email.alias_address}
                </span>
                <button
                  onClick={() => copyToClipboard(email.alias_address, 'Alias address')}
                  className="text-slate-400 hover:text-indigo-600 p-0.5"
                  title="Copy alias address"
                >
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-right text-slate-400 text-xs sm:self-start">
              <div>{new Date(email.received_at).toLocaleString()}</div>
              <div className="text-[11px] text-slate-500">{formatTimeAgo(email.received_at)}</div>
            </div>
          </div>

          {/* Authentication & Security Badges */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 font-medium text-[11px]">{t('inbox_detail.auth_header', 'Authentication:')}</span>
              <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                email.spf_result === 'pass'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}>
                SPF: {email.spf_result || 'none'}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                email.dkim_result === 'pass'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}>
                DKIM: {email.dkim_result || 'none'}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                email.dmarc_result === 'pass'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}>
                DMARC: {email.dmarc_result || 'none'}
              </span>
            </div>

            {email.message_id && (
              <div className="text-slate-400 flex items-center gap-1 text-[11px] font-mono">
                <span>Message-ID:</span>
                <span className="truncate max-w-[200px] sm:max-w-[300px]">{email.message_id}</span>
                <button
                  onClick={() => copyToClipboard(email.message_id, 'Message-ID')}
                  className="p-0.5 hover:text-indigo-600 text-slate-400"
                  title="Copy Message-ID"
                >
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* View Mode Switcher (Formatted vs Plain text) */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('html')}
              disabled={!email.clean_html}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'html'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              } disabled:opacity-30`}
            >
              🎨 {t('inbox_detail.formatted_view', 'Formatted View (HTML)')}
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              📝 {t('inbox_detail.plain_view', 'Plain Text')}
            </button>
          </div>

          <button
            onClick={() => copyToClipboard(email.text_body || '', 'Email text')}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
          >
            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
            <span>{t('inbox_detail.copy_text', 'Copy Text')}</span>
          </button>
        </div>

        {/* Email Body Rendering */}
        <div className="p-5 sm:p-6 min-h-[220px]">
          {activeTab === 'html' && email.clean_html ? (
            <div className="w-full bg-white rounded-xl overflow-hidden shadow-inner border border-slate-100">
              <iframe
                title="Email Body"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; margin: 16px; word-break: break-word;} a{color: #4f46e5;} img{max-width: 100%; height: auto;}</style></head><body>${email.clean_html}</body></html>`}
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                className="w-full min-h-[400px] border-none"
              />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words">
              {email.text_body || t('inbox_detail.no_text', 'No text content available in this email.')}
            </pre>
          )}
        </div>

        {/* Attachments Section */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="p-5 sm:p-6 bg-slate-50/50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-700/80">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3 flex items-center gap-1.5">
              <PaperClipIcon className="w-3.5 h-3.5" />
              <span>{t('inbox_detail.attachments', 'Attachments')} ({email.attachments.length})</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {email.attachments.map((att) => {
                const isInfected = att.scan_status === 'INFECTED';
                const isPending = att.scan_status === 'PENDING';
                return (
                  <div
                    key={att.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                      isInfected
                        ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/50'
                        : 'bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 flex-shrink-0">
                        <DocumentArrowDownIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate text-slate-900 dark:text-slate-100">
                          {att.safe_filename || att.filename}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatBytes(att.size)} • {att.scan_status}
                        </div>
                      </div>
                    </div>

                    {!isInfected ? (
                      <a
                        href={api.getAttachmentUrl(att.id)}
                        download
                        className="btn-secondary py-1 px-2.5 text-xs flex-shrink-0"
                      >
                        {t('inbox_detail.download', 'Download')}
                      </a>
                    ) : (
                      <span className="badge-red text-[11px]">{t('inbox_detail.blocked', 'Blocked')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reply Composer Modal / Card */}
      {showReply && (
        <div className="card p-5 sm:p-6 border-indigo-200 dark:border-indigo-900/80 shadow-lg animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowUturnLeftIcon className="w-4 h-4 text-indigo-600" />
              <span>{t('inbox_detail.compose_reply', 'Compose Reply to {sender}', { sender: email.sender })}</span>
            </h3>
            <button
              onClick={() => setShowReply(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>

          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={5}
            placeholder={t('inbox_detail.reply_placeholder', 'Write your reply here...')}
            className="input resize-none"
            autoFocus
          />

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowReply(false)}
              className="btn-secondary py-1.5 px-3.5 text-xs"
            >
              {t('inbox_detail.discard', 'Discard')}
            </button>
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sendingReply}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              {sendingReply ? t('inbox_detail.sending', 'Sending...') : t('inbox_detail.send_reply', 'Send Reply ↗')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
