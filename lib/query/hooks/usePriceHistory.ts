'use client';
import { useQuery } from '@tanstack/react-query';

export type ChartRange = '1M' | '3M' | '6M' | '12M' | 'MAX';

export type PricePoint = {
  date: string;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  highPriceCents: number | null;
  source: 'tcgcsv' | 'manual';
};

export type HistoryResponse = {
  range: ChartRange;
  points: PricePoint[];
  manualOverride: { cents: number; setAt: string } | null;
};

export function useCatalogHistory(catalogItemId: number, range: ChartRange) {
  return useQuery<HistoryResponse>({
    queryKey: ['catalog', catalogItemId, 'history', range],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/history?range=${range}`);
      if (!res.ok) throw new Error('history fetch failed');
      return res.json();
    },
  });
}
