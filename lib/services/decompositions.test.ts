import { describe, it, expect } from 'vitest';
import { computePerPackCost } from './decompositions';

describe('computePerPackCost', () => {
  it('splits $50 across 9 packs with rounding residual', () => {
    // 5000 / 9 = 555.56 → rounds to 556. 556 × 9 = 5004. residual = 5000 - 5004 = -4.
    expect(computePerPackCost(5000, 9)).toEqual({
      perPackCostCents: 556,
      roundingResidualCents: -4,
    });
  });

  it('handles zero source cost', () => {
    expect(computePerPackCost(0, 9)).toEqual({
      perPackCostCents: 0,
      roundingResidualCents: 0,
    });
  });

  it('single pack returns full cost with zero residual', () => {
    expect(computePerPackCost(500, 1)).toEqual({
      perPackCostCents: 500,
      roundingResidualCents: 0,
    });
  });

  it('clean even split has zero residual', () => {
    // 555 / 5 = 111 exactly.
    expect(computePerPackCost(555, 5)).toEqual({
      perPackCostCents: 111,
      roundingResidualCents: 0,
    });
  });

  it('rounds down with positive residual when exact midpoint', () => {
    // 100 / 3 = 33.33 → rounds to 33. 33 × 3 = 99. residual = 100 - 99 = 1.
    expect(computePerPackCost(100, 3)).toEqual({
      perPackCostCents: 33,
      roundingResidualCents: 1,
    });
  });

  it('Booster Box example: $108 across 36 packs', () => {
    // 10800 / 36 = 300 exactly.
    expect(computePerPackCost(10800, 36)).toEqual({
      perPackCostCents: 300,
      roundingResidualCents: 0,
    });
  });

  it('Tin example: $20 across 3 packs', () => {
    // 2000 / 3 = 666.67 → 667. 667 × 3 = 2001. residual = 2000 - 2001 = -1.
    expect(computePerPackCost(2000, 3)).toEqual({
      perPackCostCents: 667,
      roundingResidualCents: -1,
    });
  });

  it('throws on packCount = 0', () => {
    expect(() => computePerPackCost(500, 0)).toThrow('packCount must be > 0');
  });

  it('throws on negative packCount', () => {
    expect(() => computePerPackCost(500, -1)).toThrow('packCount must be > 0');
  });
});
