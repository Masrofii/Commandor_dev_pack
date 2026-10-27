'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, ArrowRightIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import Portal from './Portal';

export default function CommandPalette({
  open,
  onClose,
  items = [],
  actions = [],
  placeholder = 'Search pages, domains, apps…'
}) {
  const router = useRouter();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = items.map((item) => ({ ...item, kind: 'page' }));
    const commands = actions.map((item) => ({ ...item, kind: 'action' }));
    const all = [...commands, ...pages];
    if (!q) return all;
    return all.filter((item) => {
      const haystack = [item.label, item.description, item.group, item.keywords].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [actions, items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-result-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  function run(item) {
    if (!item) return;
    onClose();
    if (item.onSelect) {
      item.onSelect();
      return;
    }
    if (item.href) router.push(item.href);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(1, results.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run(results[activeIndex]);
    }
  }

  const groups = [];
  const seen = new Set();
  for (const result of results) {
    const group = result.group || (result.kind === 'action' ? 'Quick actions' : 'Pages');
    if (!seen.has(group)) {
      seen.add(group);
      groups.push({ label: group, items: [] });
    }
    groups[groups.length - 1].items.push(result);
  }

  let flatIndex = -1;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]" role="presentation">
      <div
        className="absolute inset-0 bg-cf-950/35 dark:bg-black/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-cf-200 bg-white shadow-2xl dark:border-cyber-700 dark:bg-cyber-900 animate-slide-up"
      >
        <div className="flex items-center gap-3 border-b border-cf-200 px-4 dark:border-cyber-800">
          <MagnifyingGlassIcon className="h-4.5 w-4.5 flex-shrink-0 text-cf-400 dark:text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-13 min-w-0 flex-1 bg-transparent py-4 text-sm text-cf-ink outline-none placeholder:text-cf-400 dark:text-white dark:placeholder:text-slate-500"
            aria-label="Search"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="button"
            onClick={onClose}
            className="kbd hover:bg-cf-100 dark:hover:bg-cyber-850"
            aria-label="Close search"
          >
            ESC
          </button>
        </div>

        <div ref={listRef} className="max-h-[min(62vh,440px)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-state-icon">
                <CommandLineIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-cf-700 dark:text-slate-200">No results found</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-cf-500 dark:text-slate-400">
                Try a page name, a resource, or an action such as “alias” or “deploy”.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <div className="px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cf-400 dark:text-slate-500">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const Icon = item.icon || ArrowRightIcon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${group.label}-${item.label}-${index}`}
                      type="button"
                      data-result-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => run(item)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-cf-100 text-cf-ink dark:bg-cyber-850 dark:text-white'
                          : 'text-cf-700 hover:bg-cf-50 dark:text-slate-300 dark:hover:bg-cyber-850/70'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
                          active
                            ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300'
                            : 'border-cf-200 bg-cf-50 text-cf-500 dark:border-cyber-800 dark:bg-cyber-850 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{item.label}</span>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-[11px] font-normal text-cf-500 dark:text-slate-400">
                            {item.description}
                          </span>
                        )}
                      </span>
                      {item.badge ? (
                        <span className="badge-gray flex-shrink-0">{item.badge}</span>
                      ) : (
                        <ArrowRightIcon
                          className={`h-3.5 w-3.5 flex-shrink-0 rtl:rotate-180 ${
                            active ? 'text-cf-400' : 'text-transparent'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-cf-200 bg-cf-50 px-4 py-2.5 text-[11px] text-cf-500 dark:border-cyber-800 dark:bg-cyber-950/50 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="kbd">↵</span>
              <span>Open</span>
            </span>
          </div>
          <span className="hidden sm:inline">Commandor quick search</span>
        </div>
      </div>
    </div>
  </Portal>
  );
}
