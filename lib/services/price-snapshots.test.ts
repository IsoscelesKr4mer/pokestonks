// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- vi.hoisted ensures these are available inside the hoisted vi.mock factories ---
const {
  mockReturning,
  mockOnConflictDoUpdate,
  mockValues,
  mockInsert,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockFindMany,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  const mockFindMany = vi.fn();

  return {
    mockReturning,
    mockOnConflictDoUpdate,
    mockValues,
    mockInsert,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockFindMany,
  };
});

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    query: { catalogItems: { findMany: mockFindMany } },
  },
  schema: {
    marketPrices: {
      catalogItemId: 'cat',
      snapshotDate: 'date',
      condition: 'cond',
      source: 'src',
      marketPriceCents: 'mkt',
      lowPriceCents: 'low',
      highPriceCents: 'high',
    },
    catalogItems: { id: 'id', manualMarketCents: 'manual' },
  },
}));

vi.mock('./tcgcsv-live', () => ({
  fetchAllPrices: vi.fn(),
}));

import type { ArchivePriceRow } from './tcgcsv-archive';
import { persistSnapshot, snapshotForItems } from './price-snapshots';
import * as liveModule from './tcgcsv-live';

const sample: Map<number, ArchivePriceRow> = new Map([
  [101, { tcgplayerProductId: 101, marketPriceCents: 4250, lowPriceCents: 4100, highPriceCents: 4400, subTypeName: null }],
  [202, { tcgplayerProductId: 202, marketPriceCents: 9999, lowPriceCents: 9500, highPriceCents: 11050, subTypeName: null }],
]);

describe('persistSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockUpdateReturning.mockResolvedValue([{ id: 1 }]);
    // Re-wire chains after clearAllMocks resets return values
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it('inserts one market_prices row per matched catalog item with source tcgcsv', async () => {
    const items = [
      { id: 1, tcgplayerProductId: 101, manualMarketCents: null },
      { id: 2, tcgplayerProductId: 202, manualMarketCents: null },
    ];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockValues).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ catalogItemId: 1, marketPriceCents: 4250, source: 'tcgcsv' }),
      expect.objectContaining({ catalogItemId: 2, marketPriceCents: 9999, source: 'tcgcsv' }),
    ]));
    expect(result.rowsWritten).toBe(2);
  });

  it('skips items not present in the prices Map', async () => {
    const items = [{ id: 1, tcgplayerProductId: 999, manualMarketCents: null }];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.rowsWritten).toBe(0);
  });

  it('does NOT update last_market_cents when manual_market_cents is set', async () => {
    mockReturning.mockResolvedValue([{ id: 1 }]);
    const items = [{ id: 1, tcgplayerProductId: 101, manualMarketCents: 5000 }];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.itemsSkippedManual).toBe(1);
    expect(result.itemsUpdated).toBe(0);
  });

  it('updates last_market_cents when manual is null and updateLastMarket is true', async () => {
    mockReturning.mockResolvedValue([{ id: 1 }]);
    const items = [{ id: 1, tcgplayerProductId: 101, manualMarketCents: null }];
    await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ lastMarketCents: 4250 }));
  });

  it('does NOT update last_market_cents when updateLastMarket is false', async () => {
    mockReturning.mockResolvedValue([{ id: 1 }]);
    const items = [{ id: 1, tcgplayerProductId: 101, manualMarketCents: null }];
    await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('snapshotForItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 1 }]);
    mockUpdateReturning.mockResolvedValue([{ id: 1 }]);
    // Re-wire chains after clearAllMocks resets return values
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it('short-circuits when catalogItemIds is empty', async () => {
    const result = await snapshotForItems([]);
    expect(result.rowsWritten).toBe(0);
    expect(liveModule.fetchAllPrices).not.toHaveBeenCalled();
  });

  it('fetches prices, looks up items, persists, returns date', async () => {
    vi.mocked(liveModule.fetchAllPrices).mockResolvedValue({
      prices: sample,
      groupsAttempted: 5,
      groupsFailed: 0,
    });
    mockFindMany.mockResolvedValue([
      { id: 1, tcgplayerProductId: 101, manualMarketCents: null },
    ]);
    const result = await snapshotForItems([1]);
    expect(liveModule.fetchAllPrices).toHaveBeenCalledWith([3, 50]);
    expect(result.rowsWritten).toBe(1);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
