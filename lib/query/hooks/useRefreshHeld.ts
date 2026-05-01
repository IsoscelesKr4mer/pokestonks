'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type RefreshHeldResult = {
  itemsRefreshed: number;
  rowsWritten: number;
  itemsSkippedManual: number;
  durationMs: number;
  refreshedAt: string;
};

const LS_KEY = 'pokestonks.lastRefreshHeldAt';

export function useRefreshHeld() {
  const qc = useQueryClient();
  return useMutation<RefreshHeldResult>({
    mutationFn: async () => {
      const res = await fetch('/api/prices/refresh-held', { method: 'POST' });
      if (!res.ok) throw new Error('refresh-held failed');
      return res.json();
    },
    onSuccess: (data) => {
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_KEY, data.refreshedAt);
        }
      } catch {
        // ignore
      }
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function getLastRefreshHeldAt(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}
