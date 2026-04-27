'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RipInput } from '@/lib/validation/rip';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export type RipDetailDto = {
  rip: {
    id: number;
    userId: string;
    sourcePurchaseId: number;
    ripDate: string;
    packCostCents: number;
    realizedLossCents: number;
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
  } | null;
  keptPurchases: Array<{
    purchase: {
      id: number;
      catalogItemId: number;
      costCents: number;
      condition: string | null;
    };
    catalogItem: {
      id: number;
      name: string;
      imageUrl: string | null;
    } | null;
  }>;
};

export function useRip(id: number | null) {
  return useQuery({
    queryKey: ['rip', id],
    queryFn: async () => {
      const res = await fetch(`/api/rips/${id}`);
      return json<RipDetailDto>(res);
    },
    enabled: id != null && Number.isFinite(id),
  });
}

function invalidateAfterRipMutation(
  qc: ReturnType<typeof useQueryClient>,
  affectedCatalogIds: number[]
) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['rips'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateRip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: RipInput & {
        // Caller passes the source pack's catalog id + each kept card's catalog
        // id so we can invalidate the right per-item holding caches.
        _sourceCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _, ...body } = payload;
      const res = await fetch('/api/rips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{ rip: { id: number }; keptPurchases: unknown[] }>(res);
    },
    onSuccess: (_data, variables) => {
      const affected = [
        variables._sourceCatalogItemId,
        ...variables.keptCards.map((k) => k.catalogItemId),
      ];
      invalidateAfterRipMutation(qc, affected);
    },
  });
}

export function useDeleteRip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      affectedCatalogItemIds,
    }: {
      id: number;
      affectedCatalogItemIds: number[];
    }) => {
      const res = await fetch(`/api/rips/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterRipMutation(qc, variables.affectedCatalogItemIds);
    },
  });
}
