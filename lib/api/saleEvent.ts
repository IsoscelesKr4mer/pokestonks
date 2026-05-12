/**
 * Build a SaleEvent (items[] shape) from a flat list of sale rows that share
 * a sale_group_id. Rows are grouped by catalog_item within the group so that
 * bundle sales return one entry per catalog item.
 *
 * Used by both GET /api/sales (paginated list) and GET /api/sales/[saleGroupId].
 */

export type SaleEventRowShape = {
  id: number;
  sale_date: string;
  quantity: number;
  sale_price_cents: number;
  fees_cents: number;
  matched_cost_cents: number;
  platform: string | null;
  notes: string | null;
  created_at: string;
  purchase: {
    id: number;
    purchase_date: string;
    cost_cents: number;
    unknown_cost: boolean;
    catalog_item: {
      id: number;
      name: string;
      set_name: string | null;
      product_type: string | null;
      kind: 'sealed' | 'card';
      image_url: string | null;
      image_storage_path: string | null;
    };
  };
};

export function buildSaleEvent(saleGroupId: string, rows: SaleEventRowShape[]) {
  const sorted = [...rows].sort((a, b) => {
    const ai = a.purchase.catalog_item.id;
    const bi = b.purchase.catalog_item.id;
    if (ai !== bi) return ai - bi;
    return a.id - b.id;
  });

  const perItem = new Map<number, SaleEventRowShape[]>();
  for (const r of sorted) {
    const id = r.purchase.catalog_item.id;
    const arr = perItem.get(id) ?? [];
    arr.push(r);
    perItem.set(id, arr);
  }

  const items = Array.from(perItem.values()).map((itemRows) => {
    const first = itemRows[0];
    const ci = first.purchase.catalog_item;
    const totals = itemRows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        salePriceCents: acc.salePriceCents + r.sale_price_cents,
        feesCents: acc.feesCents + r.fees_cents,
        matchedCostCents: acc.matchedCostCents + r.matched_cost_cents,
      }),
      { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
    );
    return {
      catalogItem: {
        id: ci.id,
        name: ci.name,
        setName: ci.set_name,
        productType: ci.product_type,
        kind: ci.kind,
        imageUrl: ci.image_url,
        imageStoragePath: ci.image_storage_path,
      },
      totals: {
        ...totals,
        realizedPnLCents:
          totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
      },
      unknownCost: itemRows.some((r) => r.purchase.unknown_cost),
      rows: itemRows.map((r) => ({
        saleId: r.id,
        purchaseId: r.purchase.id,
        purchaseDate: r.purchase.purchase_date,
        perUnitCostCents: r.purchase.cost_cents,
        unknownCost: r.purchase.unknown_cost,
        quantity: r.quantity,
        salePriceCents: r.sale_price_cents,
        feesCents: r.fees_cents,
        matchedCostCents: r.matched_cost_cents,
      })),
    };
  });

  const aggregateTotals = items.reduce(
    (acc, it) => ({
      quantity: acc.quantity + it.totals.quantity,
      salePriceCents: acc.salePriceCents + it.totals.salePriceCents,
      feesCents: acc.feesCents + it.totals.feesCents,
      matchedCostCents: acc.matchedCostCents + it.totals.matchedCostCents,
      realizedPnLCents: acc.realizedPnLCents + it.totals.realizedPnLCents,
    }),
    {
      quantity: 0,
      salePriceCents: 0,
      feesCents: 0,
      matchedCostCents: 0,
      realizedPnLCents: 0,
    }
  );

  const first = sorted[0];
  return {
    saleGroupId,
    saleDate: first.sale_date,
    platform: first.platform,
    notes: first.notes,
    unknownCost: items.some((i) => i.unknownCost),
    items,
    totals: aggregateTotals,
    catalogItem: items.length === 1 ? items[0].catalogItem : undefined,
    createdAt: first.created_at,
  };
}
