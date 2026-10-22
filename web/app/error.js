'use client';
import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-cyber-950 flex items-center justify-center p-4">
      <div className="card-cyber max-w-md w-full p-6 sm:p-8 text-center space-y-4 border-rose-200 dark:border-rose-900/60 shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center text-2xl font-bold shadow-md shadow-rose-500/20">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Something went wrong
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-words">
          {error?.message || 'A client-side exception occurred while rendering this view.'}
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="btn-primary w-full sm:w-auto py-2 px-5 text-xs font-semibold"
          >
            ↻ Try Again
          </button>
          <Link
            href="/inbox"
            className="btn-secondary w-full sm:w-auto py-2 px-5 text-xs text-center"
          >
            Go to Inbox
          </Link>
        </div>
      </div>
    </div>
  );
}
