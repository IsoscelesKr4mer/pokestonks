export type DeltaInput = {
  catalogItemId: number;
  nowCents: number | null;
  thenCents: number | null;
};

export type DeltaOutput = {
  deltaCents: number | null;
  deltaPct: number | null;
};

export function computeDeltas(inputs: DeltaInput[]): Map<number, DeltaOutput> {
  const result = new Map<number, DeltaOutput>();
  for (const { catalogItemId, nowCents, thenCents } of inputs) {
    if (nowCents == null || thenCents == null) {
      result.set(catalogItemId, { deltaCents: null, deltaPct: null });
      continue;
    }
    const deltaCents = nowCents - thenCents;
    if (thenCents === 0) {
      result.set(catalogItemId, { deltaCents, deltaPct: null });
      continue;
    }
    const deltaPct = Math.round(((deltaCents / thenCents) * 100) * 100) / 100;
    result.set(catalogItemId, { deltaCents, deltaPct });
  }
  return result;
}
