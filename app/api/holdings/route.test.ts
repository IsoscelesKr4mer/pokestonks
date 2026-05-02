// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockFrom,
  mockFindManyCatalogItems,
  mockFindManyMarketPrices,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFindManyCatalogItems: vi.fn(),
  mockFindManyMarketPrices: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: { findMany: mockFindManyCatalogItems },
      marketPrices: { findMany: mockFindManyMarketPrices },
    },
  },
  schema: {
    catalogItems: { id: 'id' },
    marketPrices: { catalogItemId: 'catalog_item_id', snapshotDate: 'snapshot_date' },
  },
}));

import { GET } from './route';

type Purchase = {
  id: number;
  catalog_item_id: number;
  quantity: number;
  cost_cents: number;
  unknown_cost: boolean;
  deleted_at: string | null;
  created_at: string;
  catalog_item: {
    kind: 'sealed' | 'card';
    name: string;
    set_name: string | null;
    product_type: string | null;
    image_url: string | null;
    image_storage_path: string | null;
    last_market_cents: number | null;
    last_market_at: string | null;
  };
};

function makeChain(data: unknown[] = [], error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    is: vi.fn(() => Promise.resolve({ data, error })),
  };
  return chain;
}

function setupSupabase(opts: {
  user?: { id: string } | null;
  purchases?: Purchase[];
  rips?: Array<{ id: number; source_purchase_id: number }>;
  decompositions?: Array<{ id: number; source_purchase_id: number }>;
  sales?: Array<{ id: number; purchase_id: number; quantity: number }>;
}) {
  mockGetUser.mockResolvedValue({
    data: { user: opts.user === undefined ? { id: 'user-1' } : opts.user },
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'purchases') {
      return makeChain((opts.purchases ?? []) as unknown[], null);
    }
    if (table === 'rips') {
      return {
        select: vi.fn().mockResolvedValue({ data: opts.rips ?? [], error: null }),
      };
    }
    if (table === 'box_decompositions') {
      return {
        select: vi.fn().mockResolvedValue({ data: opts.decompositions ?? [], error: null }),
      };
    }
    if (table === 'sales') {
      return {
        select: vi.fn().mockResolvedValue({ data: opts.sales ?? [], error: null }),
      };
    }
    return makeChain([], null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default db mocks: no manual prices, no "then" rows
  mockFindManyCatalogItems.mockResolvedValue([]);
  mockFindManyMarketPrices.mockResolvedValue([]);
});

describe('GET /api/holdings', () => {
  it('returns 401 when unauthenticated', async () => {
    setupSupabase({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns empty holdings array with no purchases', async () => {
    setupSupabase({ purchases: [], rips: [], decompositions: [], sales: [] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdings).toEqual([]);
  });

  it('returns holdings with existing P&L fields intact', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 10,
        quantity: 2,
        cost_cents: 5000,
        unknown_cost: false,
        deleted_at: null,
        created_at: '2026-04-01T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'SV151 ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    setupSupabase({ purchases, rips: [], decompositions: [], sales: [] });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdings).toHaveLength(1);

    const h = body.holdings[0];
    expect(h.catalogItemId).toBe(10);
    expect(h.name).toBe('SV151 ETB');
    expect(h.qtyHeld).toBe(2);
    expect(h.totalInvestedCents).toBe(10000);
    expect(h.lastMarketCents).toBe(6000);
    expect(h.currentValueCents).toBe(12000);
    expect(h.pnlCents).toBe(2000);
    expect(typeof h.pnlPct).toBe('number');
  });

  it('includes delta7dCents, delta7dPct, manualMarketCents on each holding', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 10,
        quantity: 1,
        cost_cents: 4000,
        unknown_cost: false,
        deleted_at: null,
        created_at: '2026-04-01T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'SV151 ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    setupSupabase({ purchases, rips: [], decompositions: [], sales: [] });

    // Mock: no manual price for this item
    mockFindManyCatalogItems.mockResolvedValue([{ id: 10, manualMarketCents: null }]);

    // Mock: "then" row — 7+ days ago market price was 5000
    mockFindManyMarketPrices.mockResolvedValue([
      { catalogItemId: 10, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdings).toHaveLength(1);

    const h = body.holdings[0];
    // delta = nowCents (6000, from lastMarketCents since no manual) - thenCents (5000) = 1000
    expect(h.delta7dCents).toBe(1000);
    // deltaPct = (1000 / 5000) * 100 = 20.00
    expect(h.delta7dPct).toBe(20);
    // manualMarketCents should be null (no manual set)
    expect(h.manualMarketCents).toBeNull();
  });

  it('uses manualMarketCents as nowCents when set', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 20,
        quantity: 1,
        cost_cents: 3000,
        unknown_cost: false,
        deleted_at: null,
        created_at: '2026-04-01T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'Paldea ETB',
          set_name: 'Paldea Fates',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 4000,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    setupSupabase({ purchases, rips: [], decompositions: [], sales: [] });

    // Manual price overrides lastMarketCents
    mockFindManyCatalogItems.mockResolvedValue([{ id: 20, manualMarketCents: 7000 }]);

    // "then" row was 5000
    mockFindManyMarketPrices.mockResolvedValue([
      { catalogItemId: 20, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET();
    const body = await res.json();
    const h = body.holdings[0];

    // nowCents = 7000 (manual), thenCents = 5000 → delta = 2000
    expect(h.delta7dCents).toBe(2000);
    expect(h.manualMarketCents).toBe(7000);
  });

  it('returns null deltas when no historical snapshot exists', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 30,
        quantity: 1,
        cost_cents: 3000,
        unknown_cost: false,
        deleted_at: null,
        created_at: '2026-04-01T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'New Release ETB',
          set_name: 'SV Base',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 4500,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    setupSupabase({ purchases, rips: [], decompositions: [], sales: [] });

    mockFindManyCatalogItems.mockResolvedValue([{ id: 30, manualMarketCents: null }]);
    // No historical row
    mockFindManyMarketPrices.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();
    const h = body.holdings[0];

    expect(h.delta7dCents).toBeNull();
    expect(h.delta7dPct).toBeNull();
    expect(h.manualMarketCents).toBeNull();
  });
});
