/**
 * Pure aggregation helpers for holdings views.
 * Input shape mirrors the raw rows the API route would fetch from Supabase
 * (snake_case JSON), so these helpers are testable without a DB.
 */

export type RawCatalogItem = {
  kind: 'sealed' | 'card';
  name: string;
  set_name: string | null;
  product_type: string | null;
  last_market_cents: number | null;
  last_market_at: string | null;
  image_url: string | null;
  image_storage_path: string | null;
};

export type RawPurchaseRow = {
  id: number;
  catalog_item_id: number;
  catalog_item: RawCatalogItem;
  quantity: number;
  cost_cents: number;
  deleted_at: string | null;
  created_at: string;
};

export type RawRipRow = {
  id: number;
  source_purchase_id: number;
};

export type RawDecompositionRow = {
  id: number;
  source_purchase_id: number;
};

export type Holding = {
  catalogItemId: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  qtyHeld: number;
  totalInvestedCents: number;
};

/**
 * Group purchases by catalog_item_id, subtract ripped units (sealed only),
 * compute qty_held and total_invested per item.
 *
 * Skips: soft-deleted purchases, items with qty_held <= 0 after rip
 * subtraction.
 *
 * Sort: most recently created underlying lot descending (matches the spec
 * SQL ORDER BY MAX(p.created_at) DESC).
 */
export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[],
  decompositions: readonly RawDecompositionRow[]
): Holding[] {
  // Count rips and decompositions per source purchase so we can subtract them from sealed qty.
  const consumedUnitsByPurchase = new Map<number, number>();
  for (const r of rips) {
    consumedUnitsByPurchase.set(
      r.source_purchase_id,
      (consumedUnitsByPurchase.get(r.source_purchase_id) ?? 0) + 1
    );
  }
  for (const d of decompositions) {
    consumedUnitsByPurchase.set(
      d.source_purchase_id,
      (consumedUnitsByPurchase.get(d.source_purchase_id) ?? 0) + 1
    );
  }

  type Acc = {
    holding: Holding;
    latestCreatedAt: string;
  };
  const byCatalogItem = new Map<number, Acc>();

  for (const p of purchases) {
    if (p.deleted_at != null) continue;
    const consumed = consumedUnitsByPurchase.get(p.id) ?? 0;
    const remaining = p.quantity - consumed;
    if (remaining <= 0) continue;

    const existing = byCatalogItem.get(p.catalog_item_id);
    if (existing) {
      existing.holding.qtyHeld += remaining;
      existing.holding.totalInvestedCents += p.cost_cents * remaining;
      if (p.created_at > existing.latestCreatedAt) {
        existing.latestCreatedAt = p.created_at;
      }
    } else {
      byCatalogItem.set(p.catalog_item_id, {
        holding: {
          catalogItemId: p.catalog_item_id,
          kind: p.catalog_item.kind,
          name: p.catalog_item.name,
          setName: p.catalog_item.set_name,
          productType: p.catalog_item.product_type,
          imageUrl: p.catalog_item.image_url,
          imageStoragePath: p.catalog_item.image_storage_path,
          lastMarketCents: p.catalog_item.last_market_cents,
          lastMarketAt: p.catalog_item.last_market_at,
          qtyHeld: remaining,
          totalInvestedCents: p.cost_cents * remaining,
        },
        latestCreatedAt: p.created_at,
      });
    }
  }

  return Array.from(byCatalogItem.values())
    .sort((a, b) => (a.latestCreatedAt < b.latestCreatedAt ? 1 : -1))
    .map((a) => a.holding);
}
