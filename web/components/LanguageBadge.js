export default function LanguageBadge({ id, className = '' }) {
  if (!id) return null;
  return (
    <span
      className={`inline-flex h-5 min-w-[22px] items-center justify-center rounded border border-cf-200 bg-cf-50 px-1 text-[9px] font-bold uppercase tracking-[0.08em] text-cf-600 dark:border-cyber-700 dark:bg-cyber-800 dark:text-slate-300 ${className}`}
      aria-hidden="true"
    >
      {id}
    </span>
  );
}
