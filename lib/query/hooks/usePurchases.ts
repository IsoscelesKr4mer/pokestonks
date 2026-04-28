'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseInput, PurchasePatch } from '@/lib/validation/purchase';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function usePurchases(catalogItemId?: number) {
  return useQuery({
    queryKey: ['purchases', catalogItemId ?? null],
    queryFn: async () => {
      const url = catalogItemId
        ? `/api/purchases?catalogItemId=${catalogItemId}`
        : '/api/purchases';
      const res = await fetch(url);
      return json<{ purchases: unknown[] }>(res);
    },
  });
}

export function usePurchaseSources() {
  return useQuery({
    queryKey: ['purchaseSources'],
    queryFn: async () => {
      const res = await fetch('/api/purchases/sources');
      return json<{ sources: string[] }>(res);
    },
  });
}

function invalidateAfterPurchaseMutation(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['purchases'] });
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['holding'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['purchaseSources'] });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PurchaseInput) => {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{ id: number }>(res);
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: PurchasePatch }) => {
      const res = await fetch(`/api/purchases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return json<{ id: number }>(res);
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}

export class DeletePurchaseError extends Error {
  ripIds?: number[];
  linkedSaleIds?: number[];
  decompositionIds?: number[];
  constructor(
    message: string,
    opts: { ripIds?: number[]; linkedSaleIds?: number[]; decompositionIds?: number[] } = {}
  ) {
    super(message);
    this.name = 'DeletePurchaseError';
    this.ripIds = opts.ripIds;
    this.linkedSaleIds = opts.linkedSaleIds;
    this.decompositionIds = opts.decompositionIds;
  }
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ripIds?: number[];
        linkedSaleIds?: number[];
        decompositionIds?: number[];
      };
      throw new DeletePurchaseError(body.error ?? `delete failed: ${res.status}`, {
        ripIds: body.ripIds,
        linkedSaleIds: body.linkedSaleIds,
        decompositionIds: body.decompositionIds,
      });
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}
