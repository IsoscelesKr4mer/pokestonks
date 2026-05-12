export type OpenLot = {
  purchaseId: number;
  purchaseDate: string;        // YYYY-MM-DD
  createdAt: string;           // ISO timestamp
  costCents: number;           // per-unit cost
  qtyAvailable: number;        // purchase.quantity - rips - decomps - prior sales
};

export type OpenLotWithSource = OpenLot & { source: string | null };

/**
 * Load open lots for one or more catalog items, with consumption from rips,
 * decompositions, and prior sales subtracted. Returns lots keyed by
 * catalog_item_id so bundle callers can iterate by item.
 *
 * The caller passes in a server-scoped Supabase client; RLS scopes results
 * to the current user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOpenLotsByCatalogItem(
  // Supabase types are deep generics that explode here; treat as any locally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  catalogItemIds: readonly number[]
): Promise<
  | { ok: true; lotsByCatalog: Map<number, OpenLotWithSource[]> }
  | { ok: false; error: string }
> {
  if (catalogItemIds.length === 0) return { ok: true, lotsByCatalog: new Map() };

  type PurchaseRow = {
    id: number;
    catalog_item_id: number;
    quantity: number;
    cost_cents: number;
    purchase_date: string;
    created_at: string;
    source: string | null;
  };

  const { data: lotsRaw, error: lotsErr } = await supabase
    .from('purchases')
    .select('id, catalog_item_id, quantity, cost_cents, purchase_date, created_at, source')
    .in('catalog_item_id', catalogItemIds as number[])
    .is('deleted_at', null);
  if (lotsErr) return { ok: false, error: lotsErr.message };
  const lots: PurchaseRow[] = (lotsRaw ?? []) as PurchaseRow[];
  const lotIds = lots.map((l) => l.id);

  const ripCounts = new Map<number, number>();
  const decompCounts = new Map<number, number>();
  const saleCounts = new Map<number, number>();
  if (lotIds.length > 0) {
    const { data: rips } = await supabase
      .from('rips')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    for (const r of (rips ?? []) as { source_purchase_id: number }[]) {
      ripCounts.set(r.source_purchase_id, (ripCounts.get(r.source_purchase_id) ?? 0) + 1);
    }
    const { data: decomps } = await supabase
      .from('box_decompositions')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    for (const d of (decomps ?? []) as { source_purchase_id: number }[]) {
      decompCounts.set(d.source_purchase_id, (decompCounts.get(d.source_purchase_id) ?? 0) + 1);
    }
    const { data: priorSales } = await supabase
      .from('sales')
      .select('purchase_id, quantity')
      .in('purchase_id', lotIds);
    for (const s of (priorSales ?? []) as { purchase_id: number; quantity: number }[]) {
      saleCounts.set(s.purchase_id, (saleCounts.get(s.purchase_id) ?? 0) + s.quantity);
    }
  }

  const lotsByCatalog = new Map<number, OpenLotWithSource[]>();
  for (const l of lots) {
    const lot: OpenLotWithSource = {
      purchaseId: l.id,
      purchaseDate: l.purchase_date,
      createdAt: l.created_at,
      costCents: l.cost_cents,
      qtyAvailable:
        l.quantity -
        (ripCounts.get(l.id) ?? 0) -
        (decompCounts.get(l.id) ?? 0) -
        (saleCounts.get(l.id) ?? 0),
      source: l.source,
    };
    const arr = lotsByCatalog.get(l.catalog_item_id) ?? [];
    arr.push(lot);
    lotsByCatalog.set(l.catalog_item_id, arr);
  }
  return { ok: true, lotsByCatalog };
}

export type SaleRequest = {
  totalQty: number;
  totalSalePriceCents: number; // gross
  totalFeesCents: number;
  saleDate: string;
  platform: string | null;
  notes: string | null;
};

export type SaleRow = {
  purchaseId: number;
  quantity: number;
  salePriceCents: number;       // proportional, residual on last row
  feesCents: number;            // proportional, residual on last row
  matchedCostCents: number;     // qtyConsumed * lot.costCents
};

export type FifoResult =
  | { ok: true; rows: SaleRow[]; totalMatchedCostCents: number; realizedPnLCents: number }
  | { ok: false; reason: 'insufficient_qty'; totalAvailable: number };

export function matchFifo(lots: readonly OpenLot[], req: SaleRequest): FifoResult {
  if (req.totalQty <= 0) {
    return { ok: false, reason: 'insufficient_qty', totalAvailable: 0 };
  }

  const sorted = [...lots]
    .filter((l) => l.qtyAvailable > 0)
    .sort((a, b) => {
      if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate < b.purchaseDate ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.purchaseId - b.purchaseId;
    });

  const totalAvailable = sorted.reduce((s, l) => s + l.qtyAvailable, 0);
  if (totalAvailable < req.totalQty) {
    return { ok: false, reason: 'insufficient_qty', totalAvailable };
  }

  type Pending = { purchaseId: number; quantity: number; matchedCostCents: number };
  const pending: Pending[] = [];
  let remaining = req.totalQty;
  for (const l of sorted) {
    if (remaining === 0) break;
    const take = Math.min(remaining, l.qtyAvailable);
    pending.push({ purchaseId: l.purchaseId, quantity: take, matchedCostCents: take * l.costCents });
    remaining -= take;
  }

  const rows: SaleRow[] = pending.map((p) => ({
    purchaseId: p.purchaseId,
    quantity: p.quantity,
    salePriceCents: Math.floor((req.totalSalePriceCents * p.quantity) / req.totalQty),
    feesCents: Math.floor((req.totalFeesCents * p.quantity) / req.totalQty),
    matchedCostCents: p.matchedCostCents,
  }));

  const sumPrice = rows.reduce((s, r) => s + r.salePriceCents, 0);
  const sumFees = rows.reduce((s, r) => s + r.feesCents, 0);
  const lastIdx = rows.length - 1;
  rows[lastIdx] = {
    ...rows[lastIdx],
    salePriceCents: rows[lastIdx].salePriceCents + (req.totalSalePriceCents - sumPrice),
    feesCents: rows[lastIdx].feesCents + (req.totalFeesCents - sumFees),
  };

  const totalMatchedCostCents = rows.reduce((s, r) => s + r.matchedCostCents, 0);
  const realizedPnLCents = req.totalSalePriceCents - req.totalFeesCents - totalMatchedCostCents;

  return { ok: true, rows, totalMatchedCostCents, realizedPnLCents };
}
