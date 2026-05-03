import type { ActivityEvent } from '@/components/activity/ActivityTimelineRow';
import type { HoldingPnL } from '@/lib/services/pnl';

// ---- Lot shape (explicit, not a raw Drizzle spread) ----
export interface HoldingDetailLot {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  source: string | null;
  location: string | null;
  notes: string | null;
  sourceRipId: number | null;
  /** Added for activity-event filtering (not previously on the DTO). */
  sourceDecompositionId: number | null;
  unknownCost: boolean;
  createdAt: string;
}

export interface HoldingDetailSaleRow {
  saleId: number;
  purchaseId: number;
  purchaseDate: string;
  perUnitCostCents: number;
  unknownCost: boolean;
  quantity: number;
  salePriceCents: number;
  feesCents: number;
  matchedCostCents: number;
}

export interface HoldingDetailSaleEvent {
  saleGroupId: string;
  saleDate: string;
  platform: string | null;
  notes: string | null;
  unknownCost: boolean;
  totals: {
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
    realizedPnLCents: number;
  };
  rows: HoldingDetailSaleRow[];
  createdAt: string;
}

export interface HoldingDetailDto {
  item: {
    id: number;
    kind: 'sealed' | 'card';
    name: string;
    setName: string | null;
    setCode: string | null;
    productType: string | null;
    cardNumber: string | null;
    rarity: string | null;
    variant: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    lastMarketAt: string | null;
    msrpCents: number | null;
    packCount: number | null;
  };
  holding: HoldingPnL;
  lots: Array<{
    lot: HoldingDetailLot;
    qtyRemaining: number;
    sourceRip: { id: number; ripDate: string; sourcePurchaseId: number } | null;
    sourcePack: { catalogItemId: number; name: string } | null;
    sourceDecomposition: { id: number; decomposeDate: string; sourcePurchaseId: number } | null;
    sourceContainer: { catalogItemId: number; name: string } | null;
  }>;
  rips: Array<{
    id: number;
    ripDate: string;
    packCostCents: number;
    realizedLossCents: number;
    keptCardCount: number;
    sourcePurchaseId: number;
    notes: string | null;
  }>;
  decompositions: Array<{
    id: number;
    decomposeDate: string;
    sourceCostCents: number;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    sourcePurchaseId: number;
    notes: string | null;
  }>;
  sales: HoldingDetailSaleEvent[];
  activity: ActivityEvent[];
  storefrontListing: {
    askingPriceCents: number | null;
    updatedAt: string;
  } | null;
}

// ---- Activity event builder ----

function formatPerUnit(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function buildActivityEvents(input: {
  purchases: {
    id: number;
    purchaseDate: string;
    quantity: number;
    costCents: number;
    source: string | null;
    location: string | null;
    sourceRipId: number | null;
    sourceDecompositionId: number | null;
  }[];
  rips: {
    id: number;
    ripDate: string;
    sourcePurchaseId: number;
    realizedLossCents: number;
    keptCardCount: number;
  }[];
  decompositions: {
    id: number;
    decomposeDate: string;
    sourcePurchaseId: number;
    packCount: number;
  }[];
  sales: {
    id: string;
    saleGroupId: string;
    saleDate: string;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    platform: string | null;
    matchedCostCents: number;
    unknownCost: boolean;
  }[];
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Purchases: skip rip/decomp children
  for (const p of input.purchases) {
    if (p.sourceRipId !== null || p.sourceDecompositionId !== null) continue;
    const parts: string[] = [`qty ${p.quantity} @ ${formatPerUnit(p.costCents)}`];
    if (p.source) parts.push(p.source);
    if (p.location) parts.push(p.location);
    events.push({
      kind: 'purchase',
      id: `p-${p.id}`,
      date: p.purchaseDate,
      title: 'Logged purchase',
      sub: parts.join(' · '),
      amountCents: -p.costCents,
    });
  }

  // Rips
  for (const r of input.rips) {
    events.push({
      kind: 'rip',
      id: `r-${r.id}`,
      date: r.ripDate,
      title: `Ripped ${r.keptCardCount} ${r.keptCardCount === 1 ? 'item' : 'items'}`,
      sub: 'snapshot loss locked at rip time',
      amountCents: -r.realizedLossCents,
    });
  }

  // Decompositions
  for (const d of input.decompositions) {
    events.push({
      kind: 'decomposition',
      id: `d-${d.id}`,
      date: d.decomposeDate,
      title: `Opened. Created ${d.packCount} packs`,
      sub: 'recipe applied',
      amountCents: 0,
    });
  }

  // Sales (grouped by saleGroupId -- each entry is already a group)
  for (const s of input.sales) {
    const realized = s.salePriceCents - s.feesCents - s.matchedCostCents;
    events.push({
      kind: 'sale',
      id: `s-${s.saleGroupId}`,
      date: s.saleDate,
      title: `Sold ${s.quantity}${s.platform ? ` (${s.platform})` : ''}`,
      sub: `@ ${formatPerUnit(s.salePriceCents)} net`,
      amountCents: realized,
      noBasis: s.unknownCost,
    });
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}
