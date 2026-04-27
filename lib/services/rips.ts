/**
 * Pure functions for rip math + cost-basis resolution.
 * No DB or HTTP -- safe to call from anywhere.
 */

/**
 * Compute the signed realized loss snapshot for a rip.
 *
 *   realized_loss = pack_cost - sum(kept_cost)
 *
 * Sign convention:
 *   positive: bulk write-off (user kept less value than pack cost)
 *   zero:     clean transfer (kept costs exactly equal pack cost)
 *   negative: cost-basis arbitrage (user assigned more cost than pack cost)
 *
 * Snapshot at rip time, immutable.
 */
export function computeRealizedLoss(packCostCents: number, keptCostCents: readonly number[]): number {
  const sumKept = keptCostCents.reduce((acc, c) => acc + c, 0);
  return packCostCents - sumKept;
}

/**
 * Resolve a default cost basis when the caller didn't supply one.
 * Order matches Section 5.1: msrp_cents -> last_market_cents -> 0.
 *
 *   Sealed with MSRP known: returns MSRP (vending = MSRP).
 *   Cards (no MSRP, only market): returns last_market_cents.
 *   Anything missing both: returns 0 (user can edit later).
 */
export function resolveCostBasis(item: {
  msrpCents?: number | null;
  lastMarketCents?: number | null;
}): number {
  if (item.msrpCents != null) return item.msrpCents;
  if (item.lastMarketCents != null) return item.lastMarketCents;
  return 0;
}
