'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecompositionInput } from '@/lib/validation/decomposition';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export type DecompositionDetailDto = {
  decomposition: {
    id: number;
    userId: string;
    sourcePurchaseId: number;
    decomposeDate: string;
    sourceCostCents: number;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    notes: string | null;
    createdAt: string;
  };
  sourcePurchase: {
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
    purchaseDate: string;
  } | null;
  sourceCatalogItem: {
    id: number;
    name: string;
    imageUrl: string | null;
    setName: string | null;
    productType: string | null;
  } | null;
  packPurchase: {
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
  } | null;
  packCatalogItem: {
    id: number;
    name: string;
    imageUrl: string | null;
  } | null;
};

export function useDecomposition(id: number | null) {
  return useQuery({
    queryKey: ['decomposition', id],
    queryFn: async () => {
      const res = await fetch(`/api/decompositions/${id}`);
      return json<DecompositionDetailDto>(res);
    },
    enabled: id != null && Number.isFinite(id),
  });
}

function invalidateAfterDecompositionMutation(
  qc: ReturnType<typeof useQueryClient>,
  affectedCatalogIds: number[]
) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['decompositions'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: DecompositionInput & {
        // Caller passes the source container's catalog id + the resulting pack
        // catalog id so we invalidate the right per-item holding caches.
        _sourceCatalogItemId: number;
        _packCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _src, _packCatalogItemId: _pack, ...body } = payload;
      const res = await fetch('/api/decompositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{
        decomposition: { id: number };
        packPurchase: { id: number; catalogItemId: number };
      }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterDecompositionMutation(qc, [
        variables._sourceCatalogItemId,
        variables._packCatalogItemId,
      ]);
    },
  });
}

export function useDeleteDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      affectedCatalogItemIds,
    }: {
      id: number;
      affectedCatalogItemIds: number[];
    }) => {
      const res = await fetch(`/api/decompositions/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterDecompositionMutation(qc, variables.affectedCatalogItemIds);
    },
  });
}
