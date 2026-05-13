'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SaleCreateInput,
  BundleSaleCreateInput,
  SaleUpdateInput,
} from '@/lib/validation/sale';
import type { SaleEvent } from '@/lib/types/sales';

export type { SaleEvent };
/** @deprecated Use SaleEvent from '@/lib/types/sales' instead. */
export type SaleEventDto = SaleEvent;

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

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
      return json<{ sales: SaleEvent[]; nextOffset: number | null }>(res);
    },
    staleTime: 30_000,
  });
}

export function useSale(saleGroupId: string | null) {
  return useQuery({
    queryKey: ['sale', saleGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/sales/${saleGroupId}`);
      return json<SaleEvent>(res);
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

function invalidateAfterSaleMutation(
  qc: ReturnType<typeof useQueryClient>,
  catalogItemIds: number | readonly number[]
) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['sales'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  const ids = Array.isArray(catalogItemIds) ? catalogItemIds : [catalogItemIds as number];
  for (const id of ids) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
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

export type BundleFifoPreviewItem = {
  catalogItemId: number;
  catalogItem: {
    id: number;
    name: string;
    setName: string | null;
    imageUrl: string | null;
    lastMarketCents: number | null;
  } | null;
  rows: FifoPreviewRow[];
  totals: {
    totalQty: number;
    totalSalePriceCents: number;
    totalFeesCents: number;
    totalMatchedCostCents: number;
    realizedPnLCents: number;
    qtyAvailable: number;
  };
};

export type BundleFifoPreviewResponse =
  | {
      ok: true;
      items: BundleFifoPreviewItem[];
      bundleTotals: {
        totalSalePriceCents: number;
        totalFeesCents: number;
        totalMatchedCostCents: number;
        realizedPnLCents: number;
      };
    }
  | { ok: false; reason: 'insufficient_qty'; catalogItemId: number; totalAvailable: number };

export function useBundleFifoPreview(input: BundleSaleCreateInput | null) {
  return useQuery({
    queryKey: ['sales', 'bundle-preview', input],
    queryFn: async () => {
      const res = await fetch('/api/sales/bundle/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (res.status === 422 && body.ok === false) return body as BundleFifoPreviewResponse;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as BundleFifoPreviewResponse;
    },
    enabled:
      input != null &&
      input.items.length > 0 &&
      input.items.every((i) => i.totalQty > 0 && i.catalogItemId > 0),
    staleTime: 0,
  });
}

export function useCreateBundleSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BundleSaleCreateInput) => {
      const res = await fetch('/api/sales/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return json<{ saleGroupId: string; saleIds: number[]; totals: unknown }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables.items.map((i) => i.catalogItemId));
    },
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      saleGroupId,
      patch,
    }: {
      saleGroupId: string;
      patch: SaleUpdateInput;
      catalogItemIdForInvalidation: number | readonly number[];
    }) => {
      const res = await fetch(`/api/sales/${saleGroupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.status === 204) return { saleGroupId };
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables.catalogItemIdForInvalidation);
      qc.invalidateQueries({ queryKey: ['sale', variables.saleGroupId] });
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      saleGroupId,
    }: {
      saleGroupId: string;
      catalogItemIdForInvalidation: number | readonly number[];
    }) => {
      const res = await fetch(`/api/sales/${saleGroupId}`, { method: 'DELETE' });
      if (res.status === 204) return { saleGroupId };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables.catalogItemIdForInvalidation);
    },
  });
}
