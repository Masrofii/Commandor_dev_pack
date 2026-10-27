'use client';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import PageHeader from '../../../components/PageHeader';
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

export default function SessionsPage() {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useSWR('sessions', api.getSessions);

  async function revoke(id) {
    if (!confirm('Revoke this session? That device will be logged out.')) return;
    try {
      await api.revokeSession(id);
      toast.success('Session revoked');
      mutate();
    } catch {
      toast.error('Failed to revoke session');
    }
  }

  async function revokeAll() {
    if (!confirm('Revoke all other active sessions? All other logged-in devices will be signed out.')) return;
    try {
      await api.revokeAllSessions();
      toast.success('All other sessions revoked');
      mutate();
    } catch {
      toast.error('Failed to revoke sessions');
    }
  }

  const sessions = data || [];

  return (
    <div className="page-container max-w-4xl space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {t('sessions.eyebrow', 'Access')}
          </>
        }
        title={t('sessions.title', 'Active Sessions')}
        description={t('sessions.subtitle', 'Manage web sessions and logged-in devices across all platforms')}
        actions={
          sessions.length > 1 ? (
            <button
              onClick={revokeAll}
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4 text-rose-500 rtl:rotate-180" />
              <span>{t('sessions.terminate_all_btn', 'Sign out all other devices')}</span>
            </button>
          ) : null
        }
      />

      <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">{t('common.loading', 'Loading sessions...')}</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">{t('common.no_results', 'No active sessions found.')}</div>
        ) : (
          sessions.map((s) => {
            const isMobile = (s.device_name || '').toLowerCase().includes('mobile') || (s.device_name || '').toLowerCase().includes('android') || (s.device_name || '').toLowerCase().includes('iphone');
            const Icon = isMobile ? DevicePhoneMobileIcon : ComputerDesktopIcon;

            return (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/70 dark:hover:bg-slate-750/40 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{s.device_name || 'Web Browser'}</span>
                      {s.isCurrent && (
                        <span className="badge-green text-[10px] py-0 px-2">
                          {t('sessions.current_session', 'Current Session')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      <span>IP: {s.ip_address || 'Unknown'}</span>
                      {s.last_active_at && (
                        <>
                          <span className="mx-1.5">•</span>
                          <span>Active {formatTimeAgo(s.last_active_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    className="btn-secondary py-1 px-3 text-xs hover:text-rose-500"
                  >
                    {t('common.delete', 'Revoke')}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
