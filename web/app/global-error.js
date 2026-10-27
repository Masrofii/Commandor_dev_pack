'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Fatal global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <div className="text-3xl">⚠️</div>
          <h2 className="text-lg font-bold text-white">System Error</h2>
          <p className="text-xs text-slate-400 break-words">
            {error?.message || 'An unexpected application error occurred.'}
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-2 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors"
          >
            ↻ Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
