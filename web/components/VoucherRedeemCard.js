'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useTranslation } from '../lib/i18n';
import {
  TicketIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  GlobeAltIcon,
  CommandLineIcon,
  EnvelopeIcon,
  CircleStackIcon,
  ServerStackIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const PLAN_BADGES = {
  free: {
    name: 'Free Tier',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    gradient: 'from-slate-500 to-slate-700'
  },
  starter: {
    name: 'Starter Pack',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    gradient: 'from-blue-600 to-indigo-600'
  },
  pro: {
    name: 'Pro Developer',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
    gradient: 'from-indigo-600 to-purple-600'
  },
  enterprise: {
    name: 'Enterprise Unlimited',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    gradient: 'from-rose-600 to-amber-600'
  }
};

export default function VoucherRedeemCard() {
  const { t } = useTranslation();
  const { data: subData, isLoading, mutate } = useSWR('user-subscription', () => api.getCurrentSubscription());
  const { data: plansData } = useSWR('subscription-plans', () => api.getSubscriptionPlans());

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);

  async function handleRedeem(e) {
    e.preventDefault();
    if (!code.trim()) {
      toast.error('Please enter a voucher code');
      return;
    }

    setRedeeming(true);
    setRedeemSuccess(null);
    try {
      const res = await api.redeemVoucher(code.trim().toUpperCase());
      setRedeemSuccess(res);
      toast.success(res.rewardSummary || 'Voucher code redeemed successfully!');
      setCode('');
      mutate();
    } catch (err) {
      toast.error(err.message || 'Redemption failed');
    } finally {
      setRedeeming(false);
    }
  }

  const userPlanKey = (subData?.subscription_plan || 'free').toLowerCase();
  const planBadge = PLAN_BADGES[userPlanKey] || PLAN_BADGES.free;
  const plans = plansData?.plans || [];

  return (
    <div className="space-y-6">
      {/* Current Active Plan Overview Card */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border shadow-sm ${planBadge.color}`}>
                ⭐ {subData?.plan_name || planBadge.name}
              </span>
              <span className="text-xs text-indigo-200/80 font-mono">
                Status: <span className="text-emerald-400 font-bold uppercase">{subData?.subscription_status || 'active'}</span>
              </span>
            </div>

            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              {t('voucher.title', 'Subscription & Platform Quotas')}
            </h2>

            <p className="text-xs text-indigo-100/80 max-w-xl">
              {subData?.subscription_expires_at ? (
                <>
                  Active subscription valid until <b className="text-white font-mono">{new Date(subData.subscription_expires_at).toLocaleDateString()}</b> ({subData.daysRemaining} days remaining).
                </>
              ) : (
                subData?.subscription_status === 'lifetime' 
                  ? 'Your account has Lifetime Developer Access with unlimited duration.'
                  : 'You are on the standard Free Tier. Upgrade or redeem a voucher code below to unlock pro limits.'
              )}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            <button
              onClick={() => mutate()}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all text-xs flex items-center gap-1.5"
              title="Refresh Quota Stats"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh', 'Refresh')}</span>
            </button>
          </div>
        </div>

        {/* Resource Quota Progress Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-indigo-500/20">
          <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200">
              <GlobeAltIcon className="h-4 w-4 text-cyan-400" />
              <span>{t('nav.subdomains', 'Custom Domains')}</span>
            </div>
            <div className="mt-1 text-base font-mono font-bold text-white">
              {subData?.usage?.domains || 0} <span className="text-xs text-indigo-300 font-normal">/ {subData?.custom_domain_limit > 90000 ? '∞' : subData?.custom_domain_limit || 1}</span>
            </div>
          </div>

          <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200">
              <CommandLineIcon className="h-4 w-4 text-purple-400" />
              <span>{t('nav.applications', 'Git Apps & Sites')}</span>
            </div>
            <div className="mt-1 text-base font-mono font-bold text-white">
              {subData?.usage?.applications || 0} <span className="text-xs text-indigo-300 font-normal">/ {subData?.application_limit > 90000 ? '∞' : subData?.application_limit || 3}</span>
            </div>
          </div>

          <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200">
              <EnvelopeIcon className="h-4 w-4 text-amber-400" />
              <span>{t('aliases.total_aliases', 'Active Aliases')}</span>
            </div>
            <div className="mt-1 text-base font-mono font-bold text-white">
              {subData?.usage?.aliases || 0} <span className="text-xs text-indigo-300 font-normal">/ {subData?.alias_limit > 90000 ? '∞' : subData?.alias_limit || 10}</span>
            </div>
          </div>

          <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200">
              <CircleStackIcon className="h-4 w-4 text-emerald-400" />
              <span>{t('monitoring.storage_usage', 'Email Storage')}</span>
            </div>
            <div className="mt-1 text-sm font-mono font-bold text-white">
              {subData?.storageBreakdown?.email?.usedFormatted || `${((subData?.email_storage_used || 0) / 1024 / 1024).toFixed(1)} MB`}
              <span className="text-xs text-indigo-300 font-normal block">
                quota: {subData?.storageBreakdown?.email?.limitFormatted || `${((subData?.email_storage_limit || 1073741824) / 1024 / 1024 / 1024).toFixed(1)} GB`}
              </span>
            </div>
          </div>

          <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-indigo-200">
              <ServerStackIcon className="h-4 w-4 text-pink-400" />
              <span>{t('hosting.storage_used', 'Hosting Storage')}</span>
            </div>
            <div className="mt-1 text-sm font-mono font-bold text-white">
              {subData?.storageBreakdown?.hosting?.usedFormatted || `${((subData?.hosting_storage_used || 0) / 1024 / 1024).toFixed(1)} MB`}
              <span className="text-xs text-indigo-300 font-normal block">
                quota: {subData?.storageBreakdown?.hosting?.limitFormatted || `${((subData?.hosting_storage_limit || 5368709120) / 1024 / 1024 / 1024).toFixed(1)} GB`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Redeem Voucher Card */}
      <div className="card p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
              <TicketIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                Redeem Promo Voucher or Gift Pass
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enter your activation code to claim plan upgrades, storage boosts, or developer access.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            Instant Activation
          </span>
        </div>

        {redeemSuccess && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs space-y-1 text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voucher Claimed: {redeemSuccess.title}</span>
            </div>
            <p className="text-emerald-700 dark:text-emerald-300">
              {redeemSuccess.rewardSummary}
            </p>
          </div>
        )}

        <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <TicketIcon className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="e.g. COMMANDOR-PRO-2026"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              disabled={redeeming}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-xs sm:text-sm font-mono tracking-wider outline-none focus:ring-2 focus:ring-rose-500 uppercase font-semibold text-gray-900 dark:text-white placeholder:normal-case placeholder:font-sans"
            />
          </div>
          <button
            type="submit"
            disabled={redeeming || !code.trim()}
            className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {redeeming ? (
              <>
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                <span>Redeem Voucher</span>
              </>
            )}
          </button>
        </form>

        <p className="text-[11px] text-gray-400">
          Tip: Codes are case-insensitive and can be redeemed directly via Telegram bot using: <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono text-gray-700 dark:text-gray-300">/redeem &lt;code&gt;</code>.
        </p>
      </div>

      {/* Available Tiers Comparison */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-indigo-500" />
          <span>Available Platform Tiers &amp; Perks</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(p => {
            const isCurrent = userPlanKey === p.id.toLowerCase();
            return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-gray-900 dark:text-white uppercase tracking-wider">
                      {p.name}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
                    ${p.price_usd}
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">/mo</span>
                  </div>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {p.description}
                  </p>

                  <ul className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-300">
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{p.custom_domain_limit > 90000 ? 'Unlimited' : p.custom_domain_limit} Custom Domains</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{p.application_limit > 90000 ? 'Unlimited' : p.application_limit} Git Applications</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{p.alias_limit > 90000 ? 'Unlimited' : p.alias_limit} Burner Aliases</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{(p.storage_limit / 1024 / 1024 / 1024).toFixed(0)} GB High-Speed Storage</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700/60 text-center">
                  <span className="text-[11px] text-gray-400">
                    {isCurrent ? 'Active on your account' : 'Available with voucher'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
