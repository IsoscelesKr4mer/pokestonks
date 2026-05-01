'use client';
import { useQuery } from '@tanstack/react-query';
import type { HoldingPnL } from '@/lib/services/pnl';
import type { HoldingDetailDto } from '@/lib/api/holdingDetailDto';

// Re-export canonical types from the DTO module so existing consumers
// (page.tsx, HoldingDetailClient.tsx) can keep their existing import paths.
export type {
  HoldingDetailDto,
  HoldingDetailSaleEvent,
  HoldingDetailSaleRow,
} from '@/lib/api/holdingDetailDto';

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
      return json<{ holdings: HoldingPnL[] }>(res);
    },
  });
}

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
