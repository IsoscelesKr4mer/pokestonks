import { describe, it, expect } from 'vitest';
import { computeRealizedLoss, resolveCostBasis } from './rips';

describe('computeRealizedLoss', () => {
  it('returns full pack cost when no kept cards (N=0 bulk write-off)', () => {
    expect(computeRealizedLoss(500, [])).toBe(500);
  });

  it('returns 0 when one card absorbs full pack cost', () => {
    expect(computeRealizedLoss(500, [500])).toBe(0);
  });

  it('returns positive residual when bulk is written off', () => {
    expect(computeRealizedLoss(500, [200])).toBe(300);
  });

  it('returns negative residual when keeps exceed pack cost (arbitrage)', () => {
    expect(computeRealizedLoss(500, [600])).toBe(-100);
  });

  it('handles N=2 even split with no residual', () => {
    expect(computeRealizedLoss(500, [250, 250])).toBe(0);
  });

  it('handles N=11 god pack with no residual', () => {
    const eleven = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0];
    expect(computeRealizedLoss(500, eleven)).toBe(0);
  });

  it('handles pack cost = 0', () => {
    expect(computeRealizedLoss(0, [])).toBe(0);
    expect(computeRealizedLoss(0, [100])).toBe(-100);
  });
});

describe('resolveCostBasis', () => {
  it('returns msrpCents when set', () => {
    expect(resolveCostBasis({ msrpCents: 1999, lastMarketCents: 5000 })).toBe(1999);
  });

  it('falls back to lastMarketCents when MSRP missing', () => {
    expect(resolveCostBasis({ msrpCents: null, lastMarketCents: 5000 })).toBe(5000);
  });

  it('returns 0 when both null', () => {
    expect(resolveCostBasis({ msrpCents: null, lastMarketCents: null })).toBe(0);
  });

  it('treats undefined as null', () => {
    expect(resolveCostBasis({})).toBe(0);
  });
});
