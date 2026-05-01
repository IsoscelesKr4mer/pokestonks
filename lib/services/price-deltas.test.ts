import { describe, expect, it } from 'vitest';
import { computeDeltas, type DeltaInput } from './price-deltas';

describe('computeDeltas', () => {
  it('returns null delta for items with no "then" point', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1000, thenCents: null },
    ];
    const result = computeDeltas(inputs);
    expect(result.get(1)).toEqual({ deltaCents: null, deltaPct: null });
  });

  it('computes positive delta with cents and pct', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1100, thenCents: 1000 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: 100, deltaPct: 10 });
  });

  it('computes negative delta', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 900, thenCents: 1000 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: -100, deltaPct: -10 });
  });

  it('returns deltaPct null when thenCents is zero (avoids divide-by-zero)', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 500, thenCents: 0 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: 500, deltaPct: null });
  });

  it('handles multiple items independently', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1100, thenCents: 1000 },
      { catalogItemId: 2, nowCents: 200, thenCents: null },
      { catalogItemId: 3, nowCents: 800, thenCents: 1000 },
    ];
    const result = computeDeltas(inputs);
    expect(result.get(1)).toEqual({ deltaCents: 100, deltaPct: 10 });
    expect(result.get(2)).toEqual({ deltaCents: null, deltaPct: null });
    expect(result.get(3)).toEqual({ deltaCents: -200, deltaPct: -20 });
  });

  it('rounds deltaPct to 2 decimal places', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1234, thenCents: 1111 },
    ];
    const out = computeDeltas(inputs).get(1);
    expect(out?.deltaCents).toBe(123);
    expect(out?.deltaPct).toBeCloseTo(11.07, 2);
  });
});
