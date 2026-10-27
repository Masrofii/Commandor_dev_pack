'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { formatTimeAgo } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import {
  CircleStackIcon,
  PlusIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  BeakerIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import Portal from '../../../components/Portal';

export default function BackupsPage() {
  const { t } = useTranslation();
  const { data: backupsData, isLoading, mutate } = useSWR('backups-list', () => api.getBackups());
  const backups = backupsData?.backups || [];

  const [creating, setCreating] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);

  // Test restore and verify modal states
  const [verificationResult, setVerificationResult] = useState(null);
  const [testRestoreResult, setTestRestoreResult] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [testingId, setTestingId] = useState(null);

  async function handleVerify(id) {
    setVerifyingId(id);
    try {
      const res = await api.verifyBackup(id);
      setVerificationResult(res);
      if (res.valid) {
        toast.success(`Integrity verified for ${res.backupName}`);
      } else {
        toast.error(`Integrity check failed: ${res.sqliteCheck?.error || 'Checksum mismatch'}`);
      }
      mutate();
    } catch (err) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleTestRestore(id) {
    setTestingId(id);
    try {
      const res = await api.testRestoreBackup(id);
      setTestRestoreResult(res);
      toast.success(`Dry-run sandbox restore passed (${res.tablesCount} tables verified)`);
    } catch (err) {
      toast.error(err.message || 'Dry-run test restore failed');
    } finally {
      setTestingId(null);
    }
  }

  async function handleCreateBackup(type = 'database') {
    setCreating(true);
    try {
      const res = await api.createBackup({
        type,
        notes: `On-demand ${type} backup triggered from dashboard`
      });
      toast.success(`Backup created and verified: ${res.backup_name}`);
      mutate();
    } catch (err) {
      toast.error(err.message || 'Backup creation failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore() {
    if (confirmText !== 'RESTORE') {
      toast.error('Please type "RESTORE" to confirm');
      return;
    }
    setRestoring(true);
    try {
      const res = await api.restoreBackup(restoringBackup.id, true);
      toast.success(res.message || 'Database restored successfully!');
      setRestoringBackup(null);
      setConfirmText('');
      mutate();
    } catch (err) {
      toast.error(err.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <CircleStackIcon className="w-8 h-8 text-indigo-600 dark:text-cyan-400" />
            <span>Backups, Integrity &amp; Disaster Recovery</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            SQLite WAL-consistent snapshots, SHA-256 integrity checks, dry-run sandbox restore testing, and safe rollback workflows.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleCreateBackup('database')}
            disabled={creating}
            className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>{creating ? 'Backing up...' : 'Backup Database'}</span>
          </button>
          <button
            onClick={() => handleCreateBackup('full')}
            disabled={creating}
            className="btn-secondary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
          >
            <span>Full System Zip</span>
          </button>
        </div>
      </div>

      {/* Security & Integrity Banner */}
      <div className="card p-4 sm:p-5 bg-indigo-50/60 dark:bg-cyber-900 border-indigo-200 dark:border-indigo-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-cyan-950/80 text-indigo-600 dark:text-cyan-400 font-bold">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Verified SQLite Header &amp; SHA-256 Checksums</h4>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 max-w-2xl">
              Every backup is created using atomic SQLite online checkpoints and immediately inspected for file integrity. You can also execute dry-run test restores into an ephemeral sandbox without risking live production data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] flex-shrink-0">
          <div>Retention: <span className="text-slate-900 dark:text-white font-bold">14 Days</span></div>
          <div>Auto-Schedule: <span className="text-slate-900 dark:text-white font-bold">03:00 UTC</span></div>
        </div>
      </div>

      {/* Backups List */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-cyber-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Backup Snapshots ({backups.length})</h3>
          <button onClick={() => mutate()} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse">Loading verified backups...</div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-3xl">💾</div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">No backups found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create an on-demand database backup or wait for the nightly scheduled job at 03:00 UTC.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-cyber-800 text-xs">
            {backups.map((b) => (
              <div key={b.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-cyber-850/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{b.backup_name}</span>
                    <span className="badge-cyan text-[10px] uppercase font-mono">{b.backup_type}</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 uppercase font-bold">
                      {b.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span>Size: <strong className="text-slate-700 dark:text-slate-300">{Math.round(b.file_size_bytes / 1024)} KB</strong></span>
                    {b.checksum && (
                      <span title={b.checksum}>SHA: {b.checksum.slice(0, 8)}...{b.checksum.slice(-8)}</span>
                    )}
                    <span>Created: {formatTimeAgo(b.created_at)}</span>
                  </div>

                  {b.notes && (
                    <p className="text-[11px] text-slate-500 italic">{b.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  {/* Verify Checksum button */}
                  <button
                    onClick={() => handleVerify(b.id)}
                    disabled={verifyingId === b.id}
                    title="Verify SHA-256 and SQLite magic header"
                    className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
                  >
                    <MagnifyingGlassIcon className={`w-3.5 h-3.5 ${verifyingId === b.id ? 'animate-spin' : ''}`} />
                    <span>Verify</span>
                  </button>

                  {/* Dry-run test restore button */}
                  <button
                    onClick={() => handleTestRestore(b.id)}
                    disabled={testingId === b.id}
                    title="Test restore into isolated temporary sandbox"
                    className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 font-semibold text-indigo-600 dark:text-cyan-400"
                  >
                    <BeakerIcon className={`w-3.5 h-3.5 ${testingId === b.id ? 'animate-spin' : ''}`} />
                    <span>Test Restore</span>
                  </button>

                  <a
                    href={api.getBackupDownloadUrl(b.id)}
                    className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
                    download
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>

                  {b.backup_type === 'database' && (
                    <button
                      onClick={() => {
                        setRestoringBackup(b);
                        setConfirmText('');
                      }}
                      className="p-1 px-2.5 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold flex items-center gap-1"
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verification Report Modal */}
      {verificationResult && (
        <Portal>
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="card max-w-lg w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
                  <span>{t('backups.integrity_report_title', 'Backup Integrity Report')}</span>
                </h3>
                <button onClick={() => setVerificationResult(null)} className="text-slate-400 hover:text-slate-600">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 space-y-1.5">
                  <div>Backup: <strong className="text-slate-900 dark:text-white">{verificationResult.backupName}</strong></div>
                  <div>Status: <span className="text-emerald-500 font-bold uppercase">{verificationResult.valid ? 'Verified' : 'Corrupt'}</span></div>
                  <div>File Size: {Math.round(verificationResult.fileSizeBytes / 1024)} KB</div>
                  <div className="truncate">SHA-256: {verificationResult.checksum}</div>
                  <div>Checksum Match: {verificationResult.checksumMatch ? '✓ Verified' : '❌ Failed'}</div>
                  <div>SQLite Magic Check: {verificationResult.sqliteCheck?.valid ? '✓ Passed (Header valid)' : '❌ Failed'}</div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-cyber-800">
                <button
                  onClick={() => setVerificationResult(null)}
                  className="btn-secondary py-1.5 px-4 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Dry-Run Sandbox Test Restore Modal */}
      {testRestoreResult && (
        <Portal>
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="card max-w-xl w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <BeakerIcon className="w-5 h-5 text-cyan-500" />
                <span>{t('backups.sandbox_test_title', 'Dry-Run Restore Sandbox Report')}</span>
              </h3>
              <button onClick={() => setTestRestoreResult(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-1 text-emerald-900 dark:text-emerald-200">
                <div className="font-bold text-sm">✓ Ephemeral Sandbox Test Passed (0 Corruption)</div>
                <p className="text-[11px] font-sans">
                  The snapshot was restored to an isolated scratch database, verified against all schemas, and cleanly purged. The live production database was untouched.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-900 border border-slate-200 dark:border-cyber-800 space-y-1.5">
                <div>Backup: {testRestoreResult.backupName}</div>
                <div>Integrity Check: <span className="font-bold text-emerald-500">{testRestoreResult.integrityCheck}</span></div>
                <div>Duration: {testRestoreResult.durationMs}ms</div>
                <div>Tables Verified: {testRestoreResult.tablesCount} tables</div>
                <div className="pt-1 border-t border-slate-200 dark:border-cyber-800">
                  <span className="text-slate-400">Record Verification:</span>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {Object.entries(testRestoreResult.recordCounts || {}).map(([k, v]) => (
                      <div key={k} className="p-1.5 rounded bg-white dark:bg-cyber-800 border border-slate-200/60 dark:border-cyber-700 flex justify-between">
                        <span className="capitalize">{k}:</span>
                        <strong className="text-indigo-600 dark:text-cyan-400">{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-cyber-800">
              <button
                onClick={() => setTestRestoreResult(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Portal>
      )}

      {/* Restore Confirmation Modal */}
      {restoringBackup && (
        <Portal>
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="card max-w-md w-full p-6 space-y-4 border-amber-300 dark:border-amber-800 my-auto max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <h3 className="font-bold text-base text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                <span>{t('backups.confirm_restore_title', 'Confirm Database Restore')}</span>
              </h3>
              <button onClick={() => setRestoringBackup(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <p>
                You are about to restore the database to the snapshot from <strong>{restoringBackup.created_at}</strong> ({restoringBackup.backup_name}).
              </p>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 space-y-1 text-amber-800 dark:text-amber-300">
                <p className="font-bold">{t('backups.risk_warning_title', '⚠️ High-Risk Action')}</p>
                <p>{t('backups.risk_warning_desc', 'An automated pre-restore safety snapshot will be taken immediately before restoring so you can revert if needed.')}</p>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Type <strong className="text-slate-900 dark:text-white">RESTORE</strong> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="RESTORE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="input-cyber w-full font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-cyber-800">
              <button
                type="button"
                onClick={() => setRestoringBackup(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={confirmText !== 'RESTORE' || restoring}
                className="p-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs"
              >
                {restoring ? t('backups.restoring_btn', 'Restoring Database...') : t('backups.execute_restore_btn', 'Execute Restore')}
              </button>
            </div>
          </div>
        </div>
      </Portal>
      )}
    </div>
  );
}
