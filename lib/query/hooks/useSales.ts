'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaleCreateInput } from '@/lib/validation/sale';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export type SaleEventDto = {
  saleGroupId: string;
  saleDate: string;
  platform: string | null;
  notes: string | null;
  catalogItem: {
    id: number;
    name: string;
    setName: string | null;
    productType: string | null;
    kind: 'sealed' | 'card';
    imageUrl: string | null;
    imageStoragePath: string | null;
  };
  totals: {
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
    realizedPnLCents: number;
  };
  rows: Array<{
    saleId: number;
    purchaseId: number;
    purchaseDate: string;
    perUnitCostCents: number;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
  }>;
  createdAt: string;
};

export type SalesListFilters = {
  start?: string;
  end?: string;
  platform?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useSales(filters: SalesListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.q) params.set('q', filters.q);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return useQuery({
    queryKey: ['sales', 'list', filters],
    queryFn: async () => {
      const res = await fetch(`/api/sales${qs ? `?${qs}` : ''}`);
      return json<{ sales: SaleEventDto[]; nextOffset: number | null }>(res);
    },
    staleTime: 30_000,
  });
}

export function useSale(saleGroupId: string | null) {
  return useQuery({
    queryKey: ['sale', saleGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/sales/${saleGroupId}`);
      return json<SaleEventDto>(res);
    },
    enabled: saleGroupId != null,
  });
}

export type FifoPreviewRow = {
  purchaseId: number;
  purchaseDate: string;
  purchaseSource: string | null;
  perUnitCostCents: number;
  quantity: number;
  salePriceCents: number;
  feesCents: number;
  matchedCostCents: number;
  realizedPnLCents: number;
};

export type FifoPreviewResponse =
  | {
      ok: true;
      rows: FifoPreviewRow[];
      totals: {
        totalSalePriceCents: number;
        totalFeesCents: number;
        totalMatchedCostCents: number;
        realizedPnLCents: number;
        qtyAvailable: number;
      };
    }
  | { ok: false; reason: 'insufficient_qty'; totalAvailable: number };

export function useFifoPreview(input: SaleCreateInput | null) {
  return useQuery({
    queryKey: ['sales', 'preview', input],
    queryFn: async () => {
      const res = await fetch('/api/sales/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      // 422 with insufficient_qty is a normal "not enough qty" response, not an error.
      const body = await res.json();
      if (res.status === 422 && body.ok === false) return body as FifoPreviewResponse;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as FifoPreviewResponse;
    },
    enabled:
      input != null &&
      input.totalQty > 0 &&
      input.totalSalePriceCents >= 0 &&
      input.catalogItemId > 0,
    staleTime: 0,
  });
}

function invalidateAfterSaleMutation(qc: ReturnType<typeof useQueryClient>, catalogItemId: number) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['holding', catalogItemId] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['sales'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaleCreateInput) => {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return json<{ saleGroupId: string; saleIds: number[]; totals: unknown }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables.catalogItemId);
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleGroupId, _catalogItemId }: { saleGroupId: string; _catalogItemId: number }) => {
      const res = await fetch(`/api/sales/${saleGroupId}`, { method: 'DELETE' });
      if (res.status === 204) return { saleGroupId };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables._catalogItemId);
    },
  });
}
