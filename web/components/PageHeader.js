'use client';

import Link from 'next/link';

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export function PageTab({ active = false, onClick, href, count, children, className }) {
  const classes = joinClasses(
    'group relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12px] font-semibold transition-colors',
    active
      ? 'border-brand-500 text-cf-ink dark:border-brand-400 dark:text-white'
      : 'border-transparent text-cf-500 hover:border-cf-300 hover:text-cf-800 dark:text-slate-400 dark:hover:border-cyber-600 dark:hover:text-slate-200',
    className
  );

  const content = (
    <>
      <span>{children}</span>
      {count !== undefined && count !== null && (
        <span
          className={joinClasses(
            'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
            active
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
              : 'bg-cf-100 text-cf-500 group-hover:bg-cf-200 dark:bg-cyber-800 dark:text-slate-400 dark:group-hover:bg-cyber-700'
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-current={active ? 'page' : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} aria-current={active ? 'page' : undefined}>
      {content}
    </button>
  );
}

export default function PageHeader({ eyebrow, title, description, actions, tabs, children, className, titleClassName }) {
  return (
    <header className={joinClasses('space-y-0', className)}>
      <div className="page-header">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className={joinClasses('page-header-title font-display', titleClassName)}>{title}</h1>
          {description && <p className="page-header-description">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
      </div>
      {tabs && (
        <nav className="mt-5 flex gap-0.5 overflow-x-auto border-b border-cf-200 dark:border-cyber-800 lg:flex-wrap lg:overflow-x-visible" aria-label="Page sections">
          {tabs}
        </nav>
      )}
      {children}
    </header>
  );
}
