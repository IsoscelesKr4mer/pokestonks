'use client';
import { useQuery } from '@tanstack/react-query';
import type { Holding } from '@/lib/services/holdings';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function useHoldings() {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: async () => {
      const res = await fetch('/api/holdings');
      return json<{ holdings: Holding[] }>(res);
    },
  });
}

export type HoldingDetailDto = {
  item: {
    id: number;
    kind: 'sealed' | 'card';
    name: string;
    setName: string | null;
    setCode: string | null;
    productType: string | null;
    cardNumber: string | null;
    rarity: string | null;
    variant: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    msrpCents: number | null;
    packCount: number | null;
  };
  holding: Holding;
  lots: Array<{
    lot: {
      id: number;
      catalogItemId: number;
      purchaseDate: string;
      quantity: number;
      costCents: number;
      condition: string | null;
      isGraded: boolean;
      gradingCompany: string | null;
      grade: string | null;
      certNumber: string | null;
      source: string | null;
      location: string | null;
      notes: string | null;
      sourceRipId: number | null;
      createdAt: string;
    };
    sourceRip: { id: number; ripDate: string; sourcePurchaseId: number } | null;
    sourcePack: { catalogItemId: number; name: string } | null;
    sourceDecomposition: { id: number; decomposeDate: string; sourcePurchaseId: number } | null;
    sourceContainer: { catalogItemId: number; name: string } | null;
  }>;
  rips: Array<{
    id: number;
    ripDate: string;
    packCostCents: number;
    realizedLossCents: number;
    keptCardCount: number;
    sourcePurchaseId: number;
    notes: string | null;
  }>;
  decompositions: Array<{
    id: number;
    decomposeDate: string;
    sourceCostCents: number;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    sourcePurchaseId: number;
    notes: string | null;
  }>;
};

export function useHolding(catalogItemId: number) {
  return useQuery({
    queryKey: ['holding', catalogItemId],
    queryFn: async () => {
      const res = await fetch(`/api/holdings/${catalogItemId}`);
      return json<HoldingDetailDto>(res);
    },
    enabled: Number.isFinite(catalogItemId),
  });
}
