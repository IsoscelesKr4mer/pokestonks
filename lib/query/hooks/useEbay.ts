'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

// ============================================================================
// Sync preview
// ============================================================================

export type EbaySyncPreviewLineItem = {
  ebayItemId: string;
  title: string;
  quantity: number;
  lineRevenueCents: number;
  mapped: boolean;
};

export type EbaySyncPreviewProposedItem = {
  catalogItemId: number;
  catalogName: string | null;
  quantity: number;
  salePriceCents: number;
  feesCents: number;
};

export type EbaySyncPreviewOrder = {
  ebayOrderId: string;
  saleDate: string;
  buyerUsername: string | null;
  subtotalCents: number;
  shippingCents: number;
  feesCents: number;
  netRevenueCents: number;
  lineItems: EbaySyncPreviewLineItem[];
  proposedItems: EbaySyncPreviewProposedItem[];
  isFullyMapped: boolean;
  alreadySynced: boolean;
};

export type EbaySyncPreviewResponse = {
  lastSyncedAt: string | null;
  orders: EbaySyncPreviewOrder[];
  unmappedEbayItemIds: string[];
};

export function useEbaySyncPreview(enabled: boolean) {
  return useQuery({
    queryKey: ['ebay', 'sync-preview'],
    queryFn: async () => {
      const res = await fetch('/api/ebay/sync-preview');
      return json<EbaySyncPreviewResponse>(res);
    },
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

// ============================================================================
// Sync confirm
// ============================================================================

export type EbaySyncConfirmOrder =
  | {
      action: 'skip';
      ebayOrderId: string;
    }
  | {
      action: 'confirm';
      ebayOrderId: string;
      saleDate: string;
      items: Array<{
        catalogItemId: number;
        quantity: number;
        salePriceCents: number;
        feesCents: number;
      }>;
      notes?: string | null;
    };

export type EbaySyncConfirmResult =
  | { ebayOrderId: string; status: 'created'; saleGroupId: string }
  | { ebayOrderId: string; status: 'skipped' }
  | { ebayOrderId: string; status: 'already_synced' }
  | { ebayOrderId: string; status: 'failed'; reason: string };

export function useEbaySyncConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orders: EbaySyncConfirmOrder[]) => {
      const res = await fetch('/api/ebay/sync-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      return json<{ results: EbaySyncConfirmResult[]; lastSyncedAt: string | null }>(
        res
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['ebay', 'sync-preview'] });
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'totals'] });
    },
  });
}

// ============================================================================
// Mappings
// ============================================================================

export type EbayMapping = {
  id: number;
  ebayItemId: string;
  mappings: Array<{ catalogItemId: number; qty: number }>;
  updatedAt: string;
};

export function useEbayMappings() {
  return useQuery({
    queryKey: ['ebay', 'mappings'],
    queryFn: async () => {
      const res = await fetch('/api/ebay/mappings');
      return json<{ mappings: EbayMapping[] }>(res);
    },
  });
}

export function useUpsertEbayMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ebayItemId: string;
      mappings: Array<{ catalogItemId: number; qty: number }>;
    }) => {
      const res = await fetch('/api/ebay/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return json<{ id: number; ebayItemId: string }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ebay', 'mappings'] });
      qc.invalidateQueries({ queryKey: ['ebay', 'sync-preview'] });
    },
  });
}

export function useDeleteEbayMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ebayItemId: string) => {
      const res = await fetch(
        `/api/ebay/mappings/${encodeURIComponent(ebayItemId)}`,
        { method: 'DELETE' }
      );
      return json<{ ok: true }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ebay', 'mappings'] });
      qc.invalidateQueries({ queryKey: ['ebay', 'sync-preview'] });
    },
  });
}
