/**
 * Canonical SaleEvent type matching the wire shape returned by
 * GET /api/sales and GET /api/sales/[saleGroupId].
 *
 * Single source of truth -- import from here, not from useSales.
 *
 * A sale group can span multiple catalog items (bundle sale). `items[]`
 * has length 1 for single-item sales and >1 for bundles.
 */

export interface SaleEventItem {
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
  unknownCost: boolean;
  rows: Array<{
    saleId: number;
    purchaseId: number;
    purchaseDate: string;
    perUnitCostCents: number;
    unknownCost: boolean;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
  }>;
}

export interface SaleEvent {
  saleGroupId: string;
  saleDate: string;
  platform: string | null;
  notes: string | null;
  unknownCost: boolean;
  /** Always at least one item. Length > 1 indicates a bundle sale. */
  items: SaleEventItem[];
  /** Aggregate totals across all items in the bundle. */
  totals: {
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
    realizedPnLCents: number;
  };
  /**
   * @deprecated Convenience accessor for single-item callers. Equal to items[0].catalogItem
   * when items.length === 1; otherwise undefined. New code should use `items` directly.
   */
  catalogItem?: SaleEventItem['catalogItem'];
  createdAt: string;
}

/** @deprecated Import SaleEvent from '@/lib/types/sales' instead. */
export type SaleEventDto = SaleEvent;
