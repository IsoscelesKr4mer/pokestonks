'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useSetManualPrice(catalogItemId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (manualMarketCents: number) => {
      const res = await fetch(`/api/catalog/${catalogItemId}/manual-price`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manualMarketCents }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['catalog', catalogItemId] });
    },
  });
}

export function useClearManualPrice(catalogItemId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/manual-price`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['catalog', catalogItemId] });
    },
  });
}
