'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { saveToken, saveUser, isAuthenticated } from '../../../lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [show2fa, setShow2fa] = useState(false);
  const [totp, setTotp] = useState('');
  const [pending, setPending] = useState(null);

  const [botUsername, setBotUsername] = useState(process.env.NEXT_PUBLIC_BOT_USERNAME || 'commandor_mail_bot');

  useEffect(() => {
    api.getAuthConfig().then(res => {
      if (res?.botUsername) setBotUsername(res.botUsername);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/');
      return;
    }

    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      handleTokenLogin(tokenFromUrl);
      return;
    }

    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
      handleTelegramLogin(window.Telegram.WebApp.initData);
    }
  }, [searchParams, router]);

  async function handleTokenLogin(tok) {
    if (!tok || !tok.trim()) return;
    setLoading(true);
    setError('');
    setStatusMessage('Authenticating...');
    try {
      const r = await api.loginWithToken(tok.trim());
      saveToken(r.token);
      saveUser(r.user);
      setStatusMessage('Success! Redirecting...');
      router.replace('/');
    } catch (e) {
      setError(e.message || 'Login failed. The link or token may be invalid or expired.');
      setLoading(false);
      setStatusMessage('');
    }
  }

  async function handleTelegramLogin(initData, t = null) {
    setLoading(true);
    setError('');
    setStatusMessage('Verifying Telegram account...');
    try {
      const r = await api.loginWithTelegram(initData, t);
      if (r.requiresTwoFactor) {
        setPending(initData);
        setShow2fa(true);
        setLoading(false);
        setStatusMessage('');
        return;
      }
      saveToken(r.token);
      saveUser(r.user);
      setStatusMessage('Success! Redirecting...');
      router.replace('/');
    } catch (e) {
      setError(e.message || 'Telegram authentication failed.');
      setLoading(false);
      setStatusMessage('');
    }
  }

  return (
    <div className="card-cyber p-8 sm:p-10 text-center max-w-md w-full border-slate-200 dark:border-cyber-800 shadow-xl">
      <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/25">
        CD
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-1">
        Commandor Dev Pack
      </h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
        Sign in to your cloud infrastructure &amp; developer control panel
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="mb-6 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-sm animate-pulse">
          {statusMessage}
        </div>
      )}

      {!show2fa ? (
        <div className="space-y-5">
          <a
            href={`https://t.me/${botUsername}?start=login`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full block text-center py-3 text-base shadow-sm hover:shadow transition-all"
          >
            🤖 Open Telegram to Login
          </a>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            <span className="flex-shrink mx-4 text-xs uppercase tracking-wider text-slate-400">or enter token</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              handleTokenLogin(tokenInput);
            }}
            className="space-y-3"
          >
            <input
              type="text"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Paste login token from /login command"
              className="input text-center text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              {loading ? 'Verifying...' : 'Sign In with Token'}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4">
            Type <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/login</code> in{' '}
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline"
            >
              @{botUsername}
            </a>{' '}
            to get an instant login link or token.
          </p>
        </div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            handleTelegramLogin(pending, totp);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">Enter your 2FA code</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={totp}
            onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="input text-center text-xl tracking-widest font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || totp.length !== 6}
            className="btn-primary w-full"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            className="text-sm text-indigo-600 hover:underline block mx-auto"
            onClick={() => {
              setShow2fa(false);
              setPending(null);
            }}
          >
            ← Back
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="card p-8 text-center text-slate-400">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

