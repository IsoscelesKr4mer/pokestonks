import type { Holding } from './holdings';

export const STALE_PRICE_THRESHOLD_DAYS = 7;
const STALE_THRESHOLD_MS = STALE_PRICE_THRESHOLD_DAYS * 86_400_000;

export type HoldingPnL = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  qtyHeld: number;
  qtyHeldTracked: number;
  qtyHeldCollection: number;
  totalInvestedCents: number;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  currentValueCents: number | null;
  currentValueTrackedCents: number | null;
  currentValueCollectionCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;
  priced: boolean;
  stale: boolean;
  // Enriched by API routes (not computed in-process)
  delta7dCents?: number | null;
  delta7dPct?: number | null;
  manualMarketCents?: number | null;
};

export type PortfolioPnL = {
  totalInvestedCents: number;
  pricedInvestedCents: number;
  totalCurrentValueCents: number;
  totalCurrentValueTrackedCents: number;
  totalCurrentValueCollectionCents: number;
  qtyHeldTrackedAcrossPortfolio: number;
  qtyHeldCollectionAcrossPortfolio: number;
  unrealizedPnLCents: number;
  unrealizedPnLPct: number | null;
  realizedPnLCents: number;          // unified: rips (sign-flipped) + sales
  realizedRipPnLCents: number;       // signed; preserved on wire for forward compat
  realizedSalesPnLCents: number;     // signed; preserved on wire for forward compat
  pricedCount: number;
  unpricedCount: number;
  staleCount: number;
  lotCount: number;
  lotCountTracked: number;
  lotCountCollection: number;
  perHolding: HoldingPnL[];
  bestPerformers: HoldingPnL[];
  worstPerformers: HoldingPnL[];
};

export function computeHoldingPnL(holding: Holding, now: Date): HoldingPnL {
  const priced = holding.lastMarketCents != null;
  let currentValueCents: number | null = null;
  let currentValueTrackedCents: number | null = null;
  let currentValueCollectionCents: number | null = null;
  let pnlCents: number | null = null;
  let pnlPct: number | null = null;
  let stale = false;

  if (priced) {
    const m = holding.lastMarketCents!;
    currentValueCents = m * holding.qtyHeld;
    currentValueTrackedCents = m * holding.qtyHeldTracked;
    currentValueCollectionCents = m * holding.qtyHeldCollection;

    if (holding.qtyHeldTracked > 0) {
      pnlCents = currentValueTrackedCents - holding.totalInvestedCents;
      pnlPct =
        holding.totalInvestedCents > 0
          ? (pnlCents / holding.totalInvestedCents) * 100
          : null;
    }

    if (holding.lastMarketAt == null) {
      stale = true;
    } else {
      const ageMs = now.getTime() - new Date(holding.lastMarketAt).getTime();
      stale = ageMs > STALE_THRESHOLD_MS;
    }
  }

  return {
    catalogItemId: holding.catalogItemId,
    name: holding.name,
    setName: holding.setName,
    productType: holding.productType,
    kind: holding.kind,
    imageUrl: holding.imageUrl,
    imageStoragePath: holding.imageStoragePath,
    qtyHeld: holding.qtyHeld,
    qtyHeldTracked: holding.qtyHeldTracked,
    qtyHeldCollection: holding.qtyHeldCollection,
    totalInvestedCents: holding.totalInvestedCents,
    lastMarketCents: holding.lastMarketCents,
    lastMarketAt: holding.lastMarketAt,
    currentValueCents,
    currentValueTrackedCents,
    currentValueCollectionCents,
    pnlCents,
    pnlPct,
    priced,
    stale,
  };
}

export function emptyHoldingPnL(item: {
  id: number;
  name: string;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  setName: string | null;
  productType: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
}): HoldingPnL {
  return {
    catalogItemId: item.id,
    name: item.name,
    kind: item.kind,
    imageUrl: item.imageUrl,
    imageStoragePath: item.imageStoragePath,
    setName: item.setName,
    productType: item.productType,
    lastMarketCents: item.lastMarketCents,
    lastMarketAt: item.lastMarketAt,
    qtyHeld: 0,
    qtyHeldTracked: 0,
    qtyHeldCollection: 0,
    totalInvestedCents: 0,
    currentValueCents: null,
    currentValueTrackedCents: null,
    currentValueCollectionCents: null,
    pnlCents: null,
    pnlPct: null,
    priced: false,
    stale: false,
  };
}

export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,
  realizedSalesPnLCents: number,
  lotCount: number,
  now: Date = new Date(),
  breakdown: { lotCountTracked: number; lotCountCollection: number } = {
    lotCountTracked: lotCount,
    lotCountCollection: 0,
  }
): PortfolioPnL {
  const perHolding = holdings.map((h) => computeHoldingPnL(h, now));

  let totalInvestedCents = 0;
  let pricedInvestedCents = 0;
  let totalCurrentValueCents = 0;
  let totalCurrentValueTrackedCents = 0;
  let totalCurrentValueCollectionCents = 0;
  let qtyHeldTrackedAcrossPortfolio = 0;
  let qtyHeldCollectionAcrossPortfolio = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let staleCount = 0;

  for (const h of perHolding) {
    totalInvestedCents += h.totalInvestedCents;
    qtyHeldTrackedAcrossPortfolio += h.qtyHeldTracked;
    qtyHeldCollectionAcrossPortfolio += h.qtyHeldCollection;
    if (h.priced) {
      pricedInvestedCents += h.totalInvestedCents;
      totalCurrentValueCents += h.currentValueCents ?? 0;
      totalCurrentValueTrackedCents += h.currentValueTrackedCents ?? 0;
      totalCurrentValueCollectionCents += h.currentValueCollectionCents ?? 0;
      pricedCount++;
      if (h.stale) staleCount++;
    } else {
      unpricedCount++;
    }
  }

  const unrealizedPnLCents = totalCurrentValueTrackedCents - pricedInvestedCents;
  const unrealizedPnLPct =
    pricedInvestedCents > 0
      ? (unrealizedPnLCents / pricedInvestedCents) * 100
      : null;

  const rankable = perHolding.filter((h) => h.priced && h.qtyHeldTracked > 0);
  const sortDesc = [...rankable].sort((a, b) => {
    const pa = a.pnlCents ?? 0;
    const pb = b.pnlCents ?? 0;
    if (pb !== pa) return pb - pa;
    if (b.qtyHeld !== a.qtyHeld) return b.qtyHeld - a.qtyHeld;
    return a.catalogItemId - b.catalogItemId;
  });
  const sortAsc = [...rankable].sort((a, b) => {
    const pa = a.pnlCents ?? 0;
    const pb = b.pnlCents ?? 0;
    if (pa !== pb) return pa - pb;
    if (b.qtyHeld !== a.qtyHeld) return b.qtyHeld - a.qtyHeld;
    return a.catalogItemId - b.catalogItemId;
  });

  const realizedRipPnLCents = realizedRipLossCents === 0 ? 0 : -realizedRipLossCents;
  const sumRealized = realizedRipPnLCents + realizedSalesPnLCents;
  const realizedPnLCents = sumRealized === 0 ? 0 : sumRealized;

  return {
    totalInvestedCents,
    pricedInvestedCents,
    totalCurrentValueCents,
    totalCurrentValueTrackedCents,
    totalCurrentValueCollectionCents,
    qtyHeldTrackedAcrossPortfolio,
    qtyHeldCollectionAcrossPortfolio,
    unrealizedPnLCents,
    unrealizedPnLPct,
    realizedPnLCents,
    realizedRipPnLCents,
    realizedSalesPnLCents: realizedSalesPnLCents === 0 ? 0 : realizedSalesPnLCents,
    pricedCount,
    unpricedCount,
    staleCount,
    lotCount,
    lotCountTracked: breakdown.lotCountTracked,
    lotCountCollection: breakdown.lotCountCollection,
    perHolding,
    bestPerformers: sortDesc.slice(0, 3),
    worstPerformers: sortAsc.slice(0, 3),
  };
}
