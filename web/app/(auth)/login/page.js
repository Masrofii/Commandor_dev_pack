'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { saveToken, saveUser, isAuthenticated } from '../../../lib/auth';
import { useTranslation, applyLanguage } from '../../../lib/i18n';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang, setLanguage, languages, meta } = useTranslation();
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [show2fa, setShow2fa] = useState(false);
  const [totp, setTotp] = useState('');
  const [pending, setPending] = useState(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [botUsername, setBotUsername] = useState(process.env.NEXT_PUBLIC_BOT_USERNAME || 'CommandorDevBot');

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
    setStatusMessage(t('login.authenticating', 'Authenticating...'));
    try {
      const r = await api.loginWithToken(tok.trim());
      saveToken(r.token);
      saveUser(r.user);
      if (r.user?.language) {
        applyLanguage(r.user.language);
      }
      setStatusMessage(t('login.success', 'Success! Redirecting...'));
      router.replace('/');
    } catch (e) {
      setError(e.message || t('login.error_generic', 'Login failed. The link or token may be invalid or expired.'));
      setLoading(false);
      setStatusMessage('');
    }
  }

  async function handleTelegramLogin(initData, tCode = null) {
    setLoading(true);
    setError('');
    setStatusMessage(t('login.verifying_tg', 'Verifying Telegram account...'));
    try {
      const r = await api.loginWithTelegram(initData, tCode);
      if (r.requiresTwoFactor) {
        setPending(initData);
        setShow2fa(true);
        setLoading(false);
        setStatusMessage('');
        return;
      }
      saveToken(r.token);
      saveUser(r.user);
      if (r.user?.language) {
        applyLanguage(r.user.language);
      }
      setStatusMessage(t('login.success', 'Success! Redirecting...'));
      router.replace('/');
    } catch (e) {
      setError(e.message || t('login.error_generic', 'Telegram authentication failed.'));
      setLoading(false);
      setStatusMessage('');
    }
  }

  return (
    <div className="card-cyber p-8 sm:p-10 text-center max-w-md w-full border-slate-200 dark:border-cyber-800 shadow-xl relative">
      {/* Language Switcher Button */}
      <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="p-1 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-cyber-850 transition-colors border border-slate-200 dark:border-cyber-800 flex items-center gap-1.5 text-xs font-medium"
          >
            <span>{meta.flag}</span>
            <span className="font-semibold">{meta.native}</span>
          </button>
          {showLangMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
              <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-44 bg-white dark:bg-cyber-900 rounded-xl shadow-xl border border-slate-200 dark:border-cyber-800 py-1 z-50 max-h-72 overflow-y-auto">
                {languages.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setLanguage(l.id);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-xs flex items-center justify-between text-left rtl:text-right hover:bg-slate-50 dark:hover:bg-cyber-850 transition-colors ${
                      lang === l.id ? 'font-bold text-indigo-600 dark:text-cyan-400 bg-indigo-50/50 dark:bg-cyber-800/50' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{l.flag}</span>
                      <span>{l.native}</span>
                    </span>
                    {lang === l.id && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/25">
        CD
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-1">
        {t('login.title', 'Commandor Dev Pack')}
      </h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
        {t('login.subtitle', 'Sign in to your cloud infrastructure & developer control panel')}
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
            🤖 {t('login.telegram_btn', 'Log In with Telegram WebApp')}
          </a>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            <span className="flex-shrink mx-4 text-xs uppercase tracking-wider text-slate-400">
              {t('common.or', 'or enter token')}
            </span>
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
              placeholder={t('login.token_placeholder', 'Paste login token from /login command')}
              className="input text-center text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              {loading ? t('common.loading', 'Verifying...') : t('login.signin_btn', 'Sign In with Token')}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4">
            {t('login.help_hint', 'Type /login in Telegram to get an instant access link.')}
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
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('login.twofa_prompt', 'Enter your 2FA code')}</p>
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
            {loading ? t('common.loading', 'Verifying...') : t('login.twofa_verify_btn', 'Verify & Continue')}
          </button>
          <button
            type="button"
            className="text-sm text-indigo-600 hover:underline block mx-auto"
            onClick={() => {
              setShow2fa(false);
              setPending(null);
            }}
          >
            ← {t('common.back', 'Back')}
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
