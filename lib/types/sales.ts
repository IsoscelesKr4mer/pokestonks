/**
 * Canonical SaleEvent type matching the wire shape returned by
 * GET /api/sales and GET /api/sales/[saleGroupId].
 *
 * Single source of truth -- import from here, not from useSales.
 */
export interface SaleEvent {
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
}

/** @deprecated Import SaleEvent from '@/lib/types/sales' instead. */
export type SaleEventDto = SaleEvent;
