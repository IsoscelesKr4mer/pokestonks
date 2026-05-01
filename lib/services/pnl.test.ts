import { describe, it, expect } from 'vitest';
import { computePortfolioPnL, computeHoldingPnL, emptyHoldingPnL, STALE_PRICE_THRESHOLD_DAYS } from './pnl';
import type { Holding } from './holdings';

const NOW = new Date('2026-04-28T12:00:00Z');
const RECENT = '2026-04-27T00:00:00Z';   // 1 day ago, fresh
const STALE_AT = '2026-04-15T00:00:00Z'; // 13 days ago, stale (> 7d)

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    catalogItemId: 1,
    kind: 'sealed',
    name: 'ETB',
    setName: 'SV151',
    productType: 'Elite Trainer Box',
    imageUrl: null,
    imageStoragePath: null,
    lastMarketCents: 6000,
    lastMarketAt: RECENT,
    qtyHeld: 1,
    totalInvestedCents: 5000,
    ...overrides,
  };
}

describe('computeHoldingPnL', () => {
  it('priced + fresh produces positive P&L', () => {
    const r = computeHoldingPnL(makeHolding(), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.currentValueCents).toBe(6000);
    expect(r.pnlCents).toBe(1000);
    expect(r.pnlPct).toBeCloseTo(20.0);
  });

  it('priced + stale (lastMarketAt > 7d old) flagged stale, still counts', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: STALE_AT }), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.pnlCents).toBe(1000);
  });

  it('priced + null lastMarketAt is treated as stale (defensive)', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: null }), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(true);
  });

  it('unpriced (lastMarketCents null) yields nulls', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketCents: null, lastMarketAt: null }), NOW);
    expect(r.priced).toBe(false);
    expect(r.stale).toBe(false);
    expect(r.currentValueCents).toBeNull();
    expect(r.pnlCents).toBeNull();
    expect(r.pnlPct).toBeNull();
  });

  it('cost basis zero yields null pct, P&L equal to current value', () => {
    const r = computeHoldingPnL(makeHolding({ totalInvestedCents: 0, lastMarketCents: 500, qtyHeld: 1 }), NOW);
    expect(r.pnlPct).toBeNull();
    expect(r.pnlCents).toBe(500);
    expect(r.currentValueCents).toBe(500);
  });

  it('negative P&L (current < cost) computed correctly', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketCents: 4000, totalInvestedCents: 5000 }), NOW);
    expect(r.pnlCents).toBe(-1000);
    expect(r.pnlPct).toBeCloseTo(-20.0);
  });

  it('exactly 7 days old is NOT stale (boundary)', () => {
    const exactly7d = new Date(NOW.getTime() - 7 * 86_400_000).toISOString();
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: exactly7d }), NOW);
    expect(r.stale).toBe(false);
  });
});

describe('computePortfolioPnL', () => {
  it('empty holdings → zero totals, empty arrays, null pct', () => {
    const r = computePortfolioPnL([], 0, 0, 0, NOW);
    expect(r.totalInvestedCents).toBe(0);
    expect(r.pricedInvestedCents).toBe(0);
    expect(r.totalCurrentValueCents).toBe(0);
    expect(r.unrealizedPnLCents).toBe(0);
    expect(r.unrealizedPnLPct).toBeNull();
    expect(r.realizedRipPnLCents).toBe(0);
    expect(r.pricedCount).toBe(0);
    expect(r.unpricedCount).toBe(0);
    expect(r.staleCount).toBe(0);
    expect(r.lotCount).toBe(0);
    expect(r.perHolding).toEqual([]);
    expect(r.bestPerformers).toEqual([]);
    expect(r.worstPerformers).toEqual([]);
  });

  it('all unpriced → cost basis but zero current value, null pct', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: null, lastMarketAt: null }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null, totalInvestedCents: 3000 }),
    ];
    const r = computePortfolioPnL(h, 0, 0, 2, NOW);
    expect(r.totalInvestedCents).toBe(8000);
    expect(r.pricedInvestedCents).toBe(0);
    expect(r.totalCurrentValueCents).toBe(0);
    expect(r.unrealizedPnLCents).toBe(0);
    expect(r.unrealizedPnLPct).toBeNull();
    expect(r.unpricedCount).toBe(2);
    expect(r.pricedCount).toBe(0);
    expect(r.bestPerformers).toEqual([]);
    expect(r.worstPerformers).toEqual([]);
  });

  it('mixed priced + unpriced: cost basis includes both, current value excludes unpriced', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null, totalInvestedCents: 3000 }),
    ];
    const r = computePortfolioPnL(h, 0, 0, 2, NOW);
    expect(r.totalInvestedCents).toBe(8000);
    expect(r.pricedInvestedCents).toBe(5000);
    expect(r.totalCurrentValueCents).toBe(6000);
    expect(r.unrealizedPnLCents).toBe(1000);
    expect(r.unrealizedPnLPct).toBeCloseTo(20.0);
    expect(r.pricedCount).toBe(1);
    expect(r.unpricedCount).toBe(1);
  });

  it('stale priced holding still contributes to current value + pnl, but increments staleCount', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketAt: STALE_AT }),
    ];
    const r = computePortfolioPnL(h, 0, 0, 1, NOW);
    expect(r.staleCount).toBe(1);
    expect(r.pricedCount).toBe(1);
    expect(r.unrealizedPnLCents).toBe(1000);
  });

  it('best/worst with mixed gainers + losers, sorted correctly, slice 3 each', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }), // +1000
      makeHolding({ catalogItemId: 2, lastMarketCents: 3000, totalInvestedCents: 5000 }), // -2000
      makeHolding({ catalogItemId: 3, lastMarketCents: 7000, totalInvestedCents: 5000 }), // +2000
      makeHolding({ catalogItemId: 4, lastMarketCents: 4000, totalInvestedCents: 5000 }), // -1000
      makeHolding({ catalogItemId: 5, lastMarketCents: 8000, totalInvestedCents: 5000 }), // +3000
      makeHolding({ catalogItemId: 6, lastMarketCents: 2000, totalInvestedCents: 5000 }), // -3000
      makeHolding({ catalogItemId: 7, lastMarketCents: 5000, totalInvestedCents: 5000 }), // 0
    ];
    const r = computePortfolioPnL(h, 0, 0, 7, NOW);
    expect(r.bestPerformers.map((b) => b.catalogItemId)).toEqual([5, 3, 1]);
    expect(r.worstPerformers.map((w) => w.catalogItemId)).toEqual([6, 2, 4]);
  });

  it('fewer than 3 priced holdings: best/worst length matches priced count', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null }),
    ];
    const r = computePortfolioPnL(h, 0, 0, 2, NOW);
    expect(r.bestPerformers).toHaveLength(1);
    expect(r.worstPerformers).toHaveLength(1);
    expect(r.bestPerformers[0].catalogItemId).toBe(1);
    expect(r.worstPerformers[0].catalogItemId).toBe(1);
  });

  it('realized rip P&L sign flip: positive loss → negative P&L, negative loss → positive P&L', () => {
    expect(computePortfolioPnL([], 500, 0, 0, NOW).realizedRipPnLCents).toBe(-500);
    expect(computePortfolioPnL([], -200, 0, 0, NOW).realizedRipPnLCents).toBe(200);
    expect(computePortfolioPnL([], 0, 0, 0, NOW).realizedRipPnLCents).toBe(0);
  });

  it('tie-breaking: equal pnlCents sorted by qtyHeld desc then catalogItemId asc', () => {
    // Two holdings with identical +1000 P&L; B has larger qty, A has smaller catalogItemId
    const h = [
      makeHolding({ catalogItemId: 5, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 1 }), // pnl=1000, qty=1
      makeHolding({ catalogItemId: 9, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 1 }), // pnl=1000, qty=1
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 3 }), // pnl=3000, qty=3 (different pnl so doesn't tie)
    ];
    const r = computePortfolioPnL(h, 0, 0, 3, NOW);
    // Top: id=1 (pnl 3000), then ties on 1000: qtyHeld desc tied, catalogItemId asc → 5, 9
    expect(r.bestPerformers.map((b) => b.catalogItemId)).toEqual([1, 5, 9]);
  });

  it('STALE_PRICE_THRESHOLD_DAYS is exported as 7', () => {
    expect(STALE_PRICE_THRESHOLD_DAYS).toBe(7);
  });

  it('lotCount is passed through unchanged', () => {
    const r = computePortfolioPnL([], 0, 0, 42, NOW);
    expect(r.lotCount).toBe(42);
  });

  it('realizedSalesPnLCents propagates onto wire', () => {
    const r = computePortfolioPnL([], 0, 500, 0, NOW);
    expect(r.realizedSalesPnLCents).toBe(500);
    expect(r.realizedPnLCents).toBe(500);
  });

  it('unified realizedPnLCents = rip (sign-flipped) + sales', () => {
    // realizedRipLossCents=200 (loss) -> rip pnl is -200
    // realizedSalesPnLCents=500 (already signed gain)
    // unified = -200 + 500 = 300
    const r = computePortfolioPnL([], 200, 500, 0, NOW);
    expect(r.realizedRipPnLCents).toBe(-200);
    expect(r.realizedSalesPnLCents).toBe(500);
    expect(r.realizedPnLCents).toBe(300);
  });

  it('all-zero realized: no negative-zero leak on unified', () => {
    const r = computePortfolioPnL([], 0, 0, 0, NOW);
    expect(Object.is(r.realizedPnLCents, 0)).toBe(true);
    expect(Object.is(r.realizedRipPnLCents, 0)).toBe(true);
    expect(Object.is(r.realizedSalesPnLCents, 0)).toBe(true);
  });
});

describe('emptyHoldingPnL', () => {
  it('returns a HoldingPnL shape with zero qty and null prices', () => {
    const result = emptyHoldingPnL({
      id: 1, name: 'X', kind: 'sealed',
      imageUrl: null, imageStoragePath: null,
      setName: null, productType: null,
      lastMarketCents: null, lastMarketAt: null,
    });
    expect(result.qtyHeld).toBe(0);
    expect(result.priced).toBe(false);
    expect(result.pnlCents).toBeNull();
    expect(result.currentValueCents).toBeNull();
  });
});
