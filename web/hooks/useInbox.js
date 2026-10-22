'use client';
import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';

export function useInbox(initialParams = {}) {
  const [params, setParams] = useState({ page: 1, limit: 20, ...initialParams });

  // Synchronize when parent filter or alias changes, resetting to page 1
  useEffect(() => {
    setParams(prev => {
      if (
        prev.alias !== initialParams.alias ||
        prev.unread !== initialParams.unread ||
        prev.starred !== initialParams.starred ||
        prev.q !== initialParams.q
      ) {
        return {
          page: 1,
          limit: prev.limit || 20,
          alias: initialParams.alias,
          unread: initialParams.unread,
          starred: initialParams.starred,
          q: initialParams.q
        };
      }
      return prev;
    });
  }, [initialParams.alias, initialParams.unread, initialParams.starred, initialParams.q]);

  const { data, error, isLoading, mutate } = useSWR(
    ['emails', params],
    () => api.getEmails(params),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const refresh = useCallback(() => mutate(), [mutate]);
  const handleNewEmail = useCallback(msg => {
    if (msg.type === 'email.received' || msg.type === 'email.deleted' || msg.type === 'email.read') {
      mutate();
    }
  }, [mutate]);

  return {
    emails: data?.emails || [],
    total: data?.total || 0,
    page: params.page,
    limit: params.limit,
    isLoading,
    error,
    refresh,
    handleNewEmail,
    setParams,
    nextPage: () => setParams(p => ({ ...p, page: p.page + 1 })),
    prevPage: () => setParams(p => ({ ...p, page: Math.max(1, p.page - 1) }))
  };
}
