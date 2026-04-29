import { describe, it, expect } from 'vitest';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow, type RawSaleRow } from './holdings';

const sealed = { kind: 'sealed' as const, name: 'ETB', set_name: 'SV151', product_type: 'ETB', last_market_cents: 6000, last_market_at: '2026-04-25T00:00:00Z', image_url: null, image_storage_path: null };
const card = { kind: 'card' as const, name: 'Pikachu ex', set_name: 'AH', product_type: null, last_market_cents: 117087, last_market_at: '2026-04-25T00:00:00Z', image_url: null, image_storage_path: null };

function makePurchase(overrides: Partial<RawPurchaseRow>): RawPurchaseRow {
  return {
    id: 1,
    catalog_item_id: 1,
    catalog_item: sealed,
    quantity: 1,
    cost_cents: 5000,
    deleted_at: null,
    created_at: '2026-04-25T00:00:00Z',
    ...overrides,
  };
}

describe('aggregateHoldings', () => {
  it('returns empty list when no purchases', () => {
    expect(aggregateHoldings([], [], [], [])).toEqual([]);
  });

  it('aggregates a single purchase', () => {
    const result = aggregateHoldings([makePurchase({ id: 1, quantity: 2, cost_cents: 5000 })], [], [], []);
    expect(result).toEqual([
      expect.objectContaining({
        catalogItemId: 1,
        qtyHeld: 2,
        totalInvestedCents: 10000,
        kind: 'sealed',
      }),
    ]);
  });

  it('subtracts ripped units from sealed qty', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 3, cost_cents: 5000 })];
    const rips: RawRipRow[] = [
      { id: 100, source_purchase_id: 10 },
      { id: 101, source_purchase_id: 10 },
    ];
    const result = aggregateHoldings(purchases, rips, [], []);
    expect(result[0].qtyHeld).toBe(1);
    expect(result[0].totalInvestedCents).toBe(5000);
  });

  it('excludes fully-ripped sealed lots from output', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 1, cost_cents: 5000 })];
    const rips: RawRipRow[] = [{ id: 100, source_purchase_id: 10 }];
    expect(aggregateHoldings(purchases, rips, [], [])).toEqual([]);
  });

  it('excludes soft-deleted purchases', () => {
    const purchases = [makePurchase({ id: 10, deleted_at: '2026-04-26T00:00:00Z' })];
    expect(aggregateHoldings(purchases, [], [], [])).toEqual([]);
  });

  it('groups multiple lots of the same catalog item', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 5, catalog_item: card, quantity: 1, cost_cents: 100000 }),
      makePurchase({ id: 2, catalog_item_id: 5, catalog_item: card, quantity: 2, cost_cents: 110000 }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].qtyHeld).toBe(3);
    expect(result[0].totalInvestedCents).toBe(100000 + 2 * 110000);
  });

  it('sorts by most recently created lot descending', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 1, created_at: '2026-04-20T00:00:00Z' }),
      makePurchase({ id: 2, catalog_item_id: 2, catalog_item: card, created_at: '2026-04-26T00:00:00Z' }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result[0].catalogItemId).toBe(2);
    expect(result[1].catalogItemId).toBe(1);
  });

  it('rip rows for a non-existent purchase are ignored gracefully', () => {
    const purchases = [makePurchase({ id: 10, quantity: 1 })];
    const rips: RawRipRow[] = [{ id: 999, source_purchase_id: 99999 }];
    const result = aggregateHoldings(purchases, rips, [], []);
    expect(result[0].qtyHeld).toBe(1);
  });

  it('subtracts decomposition counts from sealed qty', () => {
    const purchases = [makePurchase({ id: 20, catalog_item_id: 1, quantity: 3, cost_cents: 5000 })];
    const decompositions: RawDecompositionRow[] = [
      { id: 200, source_purchase_id: 20 },
      { id: 201, source_purchase_id: 20 },
    ];
    const result = aggregateHoldings(purchases, [], decompositions, []);
    expect(result[0].qtyHeld).toBe(1);
    expect(result[0].totalInvestedCents).toBe(5000);
  });

  it('subtracts both rips AND decompositions from same source', () => {
    const purchases = [makePurchase({ id: 30, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
    const rips: RawRipRow[] = [{ id: 300, source_purchase_id: 30 }];
    const decompositions: RawDecompositionRow[] = [{ id: 400, source_purchase_id: 30 }, { id: 401, source_purchase_id: 30 }];
    const result = aggregateHoldings(purchases, rips, decompositions, []);
    expect(result[0].qtyHeld).toBe(2);
    expect(result[0].totalInvestedCents).toBe(10000);
  });

  it('orphan decomposition rows are ignored gracefully', () => {
    const purchases = [makePurchase({ id: 40, quantity: 1 })];
    const decompositions: RawDecompositionRow[] = [{ id: 999, source_purchase_id: 99999 }];
    const result = aggregateHoldings(purchases, [], decompositions, []);
    expect(result[0].qtyHeld).toBe(1);
  });

  it('passes lastMarketAt through to the holding', () => {
    const purchases = [
      makePurchase({
        id: 1,
        catalog_item: { ...sealed, last_market_at: '2026-04-27T12:00:00Z' },
      }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result[0].lastMarketAt).toBe('2026-04-27T12:00:00Z');
  });

  it('passes null lastMarketAt through when source is null', () => {
    const purchases = [
      makePurchase({
        id: 1,
        catalog_item: { ...sealed, last_market_cents: null, last_market_at: null },
      }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result[0].lastMarketCents).toBeNull();
    expect(result[0].lastMarketAt).toBeNull();
  });

  it('subtracts sale quantity from sealed lot qty_held', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
    const sales: RawSaleRow[] = [{ id: 200, purchase_id: 10, quantity: 2 }];
    const result = aggregateHoldings(purchases, [], [], sales);
    expect(result[0].qtyHeld).toBe(3);
    expect(result[0].totalInvestedCents).toBe(3 * 5000);
  });

  it('handles multi-row sale (FIFO split) consuming the same purchase across rows', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
    const sales: RawSaleRow[] = [
      { id: 200, purchase_id: 10, quantity: 2 },
      { id: 201, purchase_id: 10, quantity: 1 },
    ];
    const result = aggregateHoldings(purchases, [], [], sales);
    expect(result[0].qtyHeld).toBe(2);
  });

  it('counts sales alongside rips and decompositions in the same purchase', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 6, cost_cents: 5000 })];
    const rips: RawRipRow[] = [{ id: 1, source_purchase_id: 10 }];
    const decomps: RawDecompositionRow[] = [{ id: 1, source_purchase_id: 10 }];
    const sales: RawSaleRow[] = [{ id: 1, purchase_id: 10, quantity: 2 }];
    const result = aggregateHoldings(purchases, rips, decomps, sales);
    expect(result[0].qtyHeld).toBe(2);  // 6 - 1 - 1 - 2
  });

  it('excludes fully-sold sealed lots from output', () => {
    const purchases = [makePurchase({ id: 10, quantity: 2 })];
    const sales: RawSaleRow[] = [{ id: 1, purchase_id: 10, quantity: 2 }];
    expect(aggregateHoldings(purchases, [], [], sales)).toEqual([]);
  });
});
