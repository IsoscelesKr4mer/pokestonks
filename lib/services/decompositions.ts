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
