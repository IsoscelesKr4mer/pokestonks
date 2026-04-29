export type OpenLot = {
  purchaseId: number;
  purchaseDate: string;        // YYYY-MM-DD
  createdAt: string;           // ISO timestamp
  costCents: number;           // per-unit cost
  qtyAvailable: number;        // purchase.quantity - rips - decomps - prior sales
};

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
