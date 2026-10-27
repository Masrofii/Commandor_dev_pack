'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { saveToken, saveUser, isAuthenticated } from '../../../lib/auth';
import { useTranslation, applyLanguage } from '../../../lib/i18n';
import { useTheme } from '../../../hooks/useTheme';
import BrandMark from '../../../components/BrandMark';
import LanguageBadge from '../../../components/LanguageBadge';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  GlobeAltIcon,
  LockClosedIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang, setLanguage, languages, meta } = useTranslation();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [show2fa, setShow2fa] = useState(false);
  const [totp, setTotp] = useState('');
  const [pending, setPending] = useState(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [authConfig, setAuthConfig] = useState(null);
  const [localUsername, setLocalUsername] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [botUsername, setBotUsername] = useState(process.env.NEXT_PUBLIC_BOT_USERNAME || '');

  useEffect(() => {
    api
      .getAuthConfig()
      .then((res) => {
        setAuthConfig(res || {});
        if (res?.botUsername) setBotUsername(res.botUsername);
        if (res?.localAuthUsername) setLocalUsername(res.localAuthUsername);
      })
      .catch(() => setAuthConfig({ telegramEnabled: true, localAuthEnabled: false }));
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

    if (authConfig?.telegramEnabled && typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
      handleTelegramLogin(window.Telegram.WebApp.initData);
    }
  }, [searchParams, router, authConfig]);

  async function handleLocalLogin(e) {
    e.preventDefault();
    if (!localUsername.trim() || !localPassword) return;
    setLoading(true);
    setError('');
    setStatusMessage(t('login.authenticating', 'Authenticating...'));
    try {
      const r = await api.loginWithLocal(localUsername.trim(), localPassword);
      saveToken(r.token);
      saveUser(r.user);
      if (r.user?.language) applyLanguage(r.user.language);
      setStatusMessage(t('login.success', 'Success! Redirecting...'));
      router.replace('/');
    } catch (err) {
      setError(err.message || t('login.error_generic', 'An error occurred during authentication.'));
      setLoading(false);
      setStatusMessage('');
    }
  }

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
    <div className="grid min-h-screen bg-cf-bg font-sans dark:bg-cyber-950 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-cf-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[54px] border-brand-500/20" />
        <div className="absolute -bottom-36 -left-20 h-96 w-96 rounded-full border-[70px] border-brand-500/10" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-brand-500/10 to-transparent" />

        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size={38} />
          <div>
            <div className="font-display text-[16px] font-bold leading-5">Commandor Dev Pack</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Cloud control plane</div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Self-hosted · production ready
          </div>
          <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.06] tracking-tight">
            One calm place for your whole cloud.
          </h1>
          <p className="mt-5 max-w-md text-[14px] leading-6 text-white/60">
            Domains, routes, applications, mail, and recovery — designed to stay clear when the stakes are high.
          </p>
          <div className="mt-8 space-y-3.5">
            {[
              { icon: GlobeAltIcon, title: 'Domains & edge routing', text: 'DNS, reverse proxy, TLS, and static hosting.' },
              { icon: CommandLineIcon, title: 'Real application runner', text: 'Git deploys with health checks and rollback.' },
              { icon: ShieldCheckIcon, title: 'Hardened by default', text: 'Scoped keys, audited actions, verified restores.' }
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-brand-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold text-white/90">{feature.title}</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-white/45">{feature.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-[10px] text-white/35">
          <LockClosedIcon className="h-3.5 w-3.5" />
          Private infrastructure. Your data stays on your host.
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark size={30} />
            <span className="font-display text-[14px] font-bold text-cf-ink dark:text-white">Commandor</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-cf-200 bg-white px-2 text-[11px] font-semibold text-cf-600 shadow-xs transition-colors hover:border-cf-300 dark:border-cyber-800 dark:bg-cyber-900 dark:text-slate-300 dark:hover:border-cyber-700"
                aria-label="Change language"
              >
                <LanguageBadge id={lang} />
                <span className="hidden sm:inline">{meta.native}</span>
                <ChevronDownIcon className="h-3 w-3 opacity-60" />
              </button>
              {showLangMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} aria-hidden="true" />
                  <div className="absolute right-0 z-50 mt-2 max-h-72 w-48 overflow-y-auto rounded-xl border border-cf-200 bg-white py-1 shadow-popover dark:border-cyber-800 dark:bg-cyber-900">
                    {languages.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        onClick={() => {
                          setLanguage(language.id);
                          setShowLangMenu(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-cf-50 dark:hover:bg-cyber-850 ${
                          lang === language.id
                            ? 'bg-cf-50 font-semibold text-brand-700 dark:bg-cyber-850 dark:text-brand-300'
                            : 'text-cf-600 dark:text-slate-300'
                        }`}
                      >
                        <LanguageBadge id={language.id} />
                        <span className="flex-1">{language.native}</span>
                        {lang === language.id && <CheckCircleIcon className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-cf-200 bg-white text-cf-500 shadow-xs transition-colors hover:border-cf-300 hover:text-cf-800 dark:border-cyber-800 dark:bg-cyber-900 dark:text-slate-400 dark:hover:border-cyber-700 dark:hover:text-white"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[360px]">
            <div className="mb-7">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-900/60 dark:bg-brand-950/40 dark:text-brand-300 lg:hidden">
                <LockClosedIcon className="h-5 w-5" />
              </div>
              <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight text-cf-ink dark:text-white">
                Sign in to your workspace
              </h1>
              <p className="mt-2 text-[12px] leading-5 text-cf-500 dark:text-slate-400">
                {t('login.subtitle', 'Use your local administrator account or Telegram to continue.')}
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] leading-5 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300" role="alert">
                {error}
              </div>
            )}

            {statusMessage && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-[12px] text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-brand-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                {statusMessage}
              </div>
            )}

            {!show2fa ? (
              <div className="space-y-5">
                {authConfig === null ? (
                  <div className="space-y-3 py-4">
                    <div className="skeleton h-10 w-full" />
                    <div className="skeleton h-10 w-full" />
                    <div className="skeleton h-10 w-2/3" />
                  </div>
                ) : (
                  <>
                    {authConfig.localAuthEnabled && (
                      <form onSubmit={handleLocalLogin} className="space-y-4">
                        <div>
                          <label className="label" htmlFor="local-username">
                            {t('login.local_username', 'Username')}
                          </label>
                          <input
                            id="local-username"
                            type="text"
                            value={localUsername}
                            onChange={(e) => setLocalUsername(e.target.value)}
                            autoComplete="username"
                            placeholder={t('login.local_username_placeholder', 'Local administrator username')}
                            className="input"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="label mb-0" htmlFor="local-password">
                              {t('login.local_password', 'Password')}
                            </label>
                            <span className="text-[10px] text-cf-400 dark:text-slate-500">Local account</span>
                          </div>
                          <input
                            id="local-password"
                            type="password"
                            value={localPassword}
                            onChange={(e) => setLocalPassword(e.target.value)}
                            autoComplete="current-password"
                            placeholder={t('login.local_password_placeholder', 'Enter your password')}
                            className="input"
                            disabled={loading}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading || !localUsername.trim() || !localPassword}
                          className="btn-primary h-10 w-full"
                        >
                          {loading ? t('common.loading', 'Signing in...') : t('login.local_signin_btn', 'Sign in')}
                        </button>
                      </form>
                    )}

                    {authConfig.telegramEnabled && (
                      <>
                        {authConfig.localAuthEnabled && (
                          <div className="relative flex items-center py-1">
                            <div className="flex-grow border-t border-cf-200 dark:border-cyber-800" />
                            <span className="mx-3 flex-shrink text-[10px] font-semibold uppercase tracking-[0.14em] text-cf-400 dark:text-slate-500">
                              {t('common.or', 'or')}
                            </span>
                            <div className="flex-grow border-t border-cf-200 dark:border-cyber-800" />
                          </div>
                        )}

                        <a
                          href={`https://t.me/${botUsername}?start=login`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary h-10 w-full"
                        >
                          <SparkleBotIcon />
                          {t('login.telegram_btn', 'Continue with Telegram')}
                        </a>

                        <details className="group rounded-lg border border-cf-200 bg-white px-3 py-2.5 text-[12px] dark:border-cyber-800 dark:bg-cyber-900">
                          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-cf-600 dark:text-slate-300">
                            <span>{t('login.signin_btn', 'Use a login token')}</span>
                            <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                          </summary>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleTokenLogin(tokenInput);
                            }}
                            className="mt-3 space-y-2"
                          >
                            <input
                              type="text"
                              value={tokenInput}
                              onChange={(e) => setTokenInput(e.target.value)}
                              placeholder={t('login.token_placeholder', 'Paste login token from /login command')}
                              className="input text-center text-xs"
                              disabled={loading}
                            />
                            <button type="submit" disabled={loading || !tokenInput.trim()} className="btn-primary h-9 w-full">
                              {loading ? t('common.loading', 'Verifying...') : t('login.signin_btn', 'Sign in with token')}
                            </button>
                          </form>
                        </details>

                        <p className="text-center text-[10px] leading-4 text-cf-400 dark:text-slate-500">
                          {t('login.help_hint', 'Type /login in Telegram to get an instant access link.')}
                        </p>
                      </>
                    )}

                    {!authConfig.localAuthEnabled && !authConfig.telegramEnabled && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                        {t(
                          'login.no_methods',
                          'No sign-in method is configured. Set LOCAL_ADMIN_PASSWORD (and restart) or configure TELEGRAM_BOT_TOKEN.'
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTelegramLogin(pending, totp);
                }}
                className="space-y-4"
              >
                <div className="rounded-lg border border-cf-200 bg-cf-50 p-3 text-[12px] text-cf-600 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-300">
                  {t('login.twofa_prompt', 'Enter the 6-digit code from your authenticator app.')}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="input py-3 text-center font-mono text-xl tracking-[0.3em]"
                  autoFocus
                  aria-label="Two-factor code"
                />
                <button type="submit" disabled={loading || totp.length !== 6} className="btn-primary h-10 w-full">
                  {loading ? t('common.loading', 'Verifying...') : t('login.twofa_verify_btn', 'Verify & continue')}
                </button>
                <button
                  type="button"
                  className="mx-auto block text-[12px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
                  onClick={() => {
                    setShow2fa(false);
                    setPending(null);
                  }}
                >
                  ← {t('common.back', 'Back')}
                </button>
              </form>
            )}

            <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-cf-400 dark:text-slate-500">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              Protected by Commandor security controls
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SparkleBotIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M9.04 15.53a7.5 7.5 0 0 1-1.54-1.99l-.02-.04-.02.04a7.5 7.5 0 0 1-1.54 1.99c-.53.48-1.1.88-1.68 1.2l-.02.01.02.01c.58.32 1.15.72 1.68 1.2a7.5 7.5 0 0 1 1.54 1.99l.02.04.02-.04a7.5 7.5 0 0 1 1.54-1.99c.53-.48 1.1-.88 1.68-1.2l.02-.01-.02-.01a10.4 10.4 0 0 1-1.68-1.2Zm9.1-10.68a5.2 5.2 0 0 1-1.07-1.38L17.05 3l-.02.47a5.2 5.2 0 0 1-1.07 1.38c-.37.33-.77.61-1.17.84l-.02.01.02.01c.4.23.8.51 1.17.84.44.4.8.85 1.07 1.38l.02.04.02-.04c.27-.53.63-.98 1.07-1.38.37-.33.77-.61 1.17-.84l.02-.01-.02-.01a8.3 8.3 0 0 1-1.17-.84Z" />
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-cf-bg dark:bg-cyber-950">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-cf-bg dark:bg-cyber-950">
            <div className="flex flex-col items-center gap-3">
              <BrandMark size={40} />
              <div className="text-[12px] font-medium text-cf-500 dark:text-slate-400">Loading sign-in…</div>
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
