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
  childPurchases: Array<{
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
    unknownCost: boolean;
  }>;
  childCatalogItems: Array<{
    id: number;
    name: string;
    imageUrl: string | null;
    setName: string | null;
    kind: 'sealed' | 'card';
    productType: string | null;
  }>;
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
  qc.invalidateQueries({ queryKey: ['catalogComposition'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: DecompositionInput & {
        // Caller passes the source container's catalog id. The created
        // children's catalog ids are returned by the API and used for
        // per-holding cache invalidation in onSuccess.
        _sourceCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _src, ...body } = payload;
      const res = await fetch('/api/decompositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{
        decomposition: { id: number };
        packPurchases: Array<{ id: number; catalogItemId: number }>;
      }>(res);
    },
    onSuccess: (data, variables) => {
      const childIds = data.packPurchases.map((p) => p.catalogItemId);
      invalidateAfterDecompositionMutation(qc, [
        variables._sourceCatalogItemId,
        ...childIds,
      ]);
    },
  });
}

export type CatalogCompositionDto = {
  sourceCatalogItemId: number;
  sourceName: string;
  sourcePackCount: number | null;
  sourceProductType: string | null;
  recipe: Array<{
    contentsCatalogItemId: number;
    quantity: number;
    contentsName: string;
    contentsSetName: string | null;
    contentsImageUrl: string | null;
    contentsKind: 'sealed' | 'card';
    contentsProductType: string | null;
  }> | null;
  persisted: boolean;
  suggested: boolean;
};

export function useCatalogComposition(catalogItemId: number | null) {
  return useQuery({
    queryKey: ['catalogComposition', catalogItemId],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/composition`);
      return json<CatalogCompositionDto>(res);
    },
    enabled: catalogItemId != null && Number.isFinite(catalogItemId),
  });
}

export function useClearCatalogComposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (catalogItemId: number) => {
      const res = await fetch(`/api/catalog/${catalogItemId}/composition`, {
        method: 'DELETE',
      });
      return json<{ deleted: number }>(res);
    },
    onSuccess: (_data, catalogItemId) => {
      qc.invalidateQueries({ queryKey: ['catalogComposition', catalogItemId] });
    },
  });
}

export function useDeleteDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
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
