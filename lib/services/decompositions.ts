/**
 * Pure functions for box decomposition math.
 * No DB or HTTP — safe to call from anywhere.
 */

/**
 * Split a source box's cost evenly across pack_count packs.
 *
 *   per_pack_cost   = round(source_cost / pack_count)
 *   rounding_residual = source_cost - per_pack_cost * pack_count
 *
 * Sign of residual: negative when rounding pushed the per-pack cost up
 * (we now overstate total by |residual| cents); positive when rounding
 * pushed it down (we understate total). Typically -9..+9 cents.
 *
 * Snapshotted on the box_decompositions row at decompose time.
 */
export function computePerPackCost(
  sourceCostCents: number,
  packCount: number
): { perPackCostCents: number; roundingResidualCents: number } {
  if (packCount <= 0) throw new Error('packCount must be > 0');
  const perPack = Math.round(sourceCostCents / packCount);
  const residual = sourceCostCents - perPack * packCount;
  return { perPackCostCents: perPack, roundingResidualCents: residual };
}

/**
 * Sum the quantities of recipe rows whose contents catalog item is kind='sealed'.
 * Card-kind rows are excluded -- they're freebies at $0 cost basis.
 *
 * Throws if a row references a catalog item not present in the lookup map.
 *
 * Used by POST /api/decompositions to compute the cost-split divisor and by
 * OpenBoxDialog to render the live preview.
 */
export function computeCostSplitTotal(
  recipe: Array<{ contentsCatalogItemId: number; quantity: number }>,
  contentsCatalogByItemId: Map<number, { id: number; kind: 'sealed' | 'card' }>
): number {
  let total = 0;
  for (const row of recipe) {
    const item = contentsCatalogByItemId.get(row.contentsCatalogItemId);
    if (!item) {
      throw new Error(`missing catalog item for contentsCatalogItemId ${row.contentsCatalogItemId}`);
    }
    if (item.kind === 'sealed') total += row.quantity;
  }
  return total;
}
