// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindManyCatalogItems, mockFindManyMarketPrices } = vi.hoisted(() => ({
  mockFindManyCatalogItems: vi.fn(),
  mockFindManyMarketPrices: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
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

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

type Purchase = {
  id: number;
  catalog_item_id: number;
  quantity: number;
  cost_cents: number;
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

function buildSupabase(opts: {
  authedUserId?: string | null;
  purchases?: Purchase[];
  rips?: Array<{ id: number; source_purchase_id: number; realized_loss_cents: number }>;
  decompositions?: Array<{ id: number; source_purchase_id: number }>;
  sales?: Array<{ id: number; purchase_id: number; quantity: number; sale_price_cents: number; fees_cents: number; matched_cost_cents: number; sale_group_id: string }>;
}) {
  const fromMap: Record<string, unknown> = {
    purchases: {
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data: opts.purchases ?? [], error: null }),
      }),
    },
    rips: {
      select: vi.fn().mockResolvedValue({ data: opts.rips ?? [], error: null }),
    },
    box_decompositions: {
      select: vi.fn().mockResolvedValue({ data: opts.decompositions ?? [], error: null }),
    },
    sales: {
      select: vi.fn().mockResolvedValue({ data: opts.sales ?? [], error: null }),
    },
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.authedUserId == null ? null : { id: opts.authedUserId } },
      }),
    },
    from: vi.fn((table: string) => fromMap[table]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no manual prices, no historical snapshot rows
  mockFindManyCatalogItems.mockResolvedValue([]);
  mockFindManyMarketPrices.mockResolvedValue([]);
});

describe('GET /api/dashboard/totals', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: null })
    );
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns zeros for empty data', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases: [], rips: [], decompositions: [] })
    );
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalInvestedCents).toBe(0);
    expect(body.unrealizedPnLPct).toBeNull();
    expect(body.bestPerformers).toEqual([]);
    expect(body.worstPerformers).toEqual([]);
  });

  it('mixed priced + unpriced fixture: unrealized P&L computed correctly', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 1,
        quantity: 1,
        cost_cents: 5000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-27T00:00:00Z',
        },
      },
      {
        id: 2,
        catalog_item_id: 2,
        quantity: 1,
        cost_cents: 3000,
        deleted_at: null,
        created_at: '2026-04-26T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'Tin',
          set_name: 'SV151',
          product_type: 'Tin',
          image_url: null,
          image_storage_path: null,
          last_market_cents: null,
          last_market_at: null,
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.totalInvestedCents).toBe(8000);
    expect(body.pricedInvestedCents).toBe(5000);
    expect(body.totalCurrentValueCents).toBe(6000);
    expect(body.unrealizedPnLCents).toBe(1000);
    expect(body.pricedCount).toBe(1);
    expect(body.unpricedCount).toBe(1);
    expect(body.lotCount).toBe(2);
  });

  it('subtracts ripped + decomposed qty before pricing', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 1,
        quantity: 3,
        cost_cents: 5000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-27T00:00:00Z',
        },
      },
    ];
    const rips = [{ id: 100, source_purchase_id: 1, realized_loss_cents: 500 }];
    const decompositions = [{ id: 200, source_purchase_id: 1 }];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips, decompositions })
    );
    const res = await GET();
    const body = await res.json();
    // qty=3, 1 rip + 1 decomp consumed → 1 left, value = 6000, invested = 5000, pnl = 1000
    expect(body.totalCurrentValueCents).toBe(6000);
    expect(body.pricedInvestedCents).toBe(5000);
    expect(body.unrealizedPnLCents).toBe(1000);
    expect(body.realizedRipPnLCents).toBe(-500);
  });

  it('realized rip P&L sign is flipped at the boundary', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({
        authedUserId: 'u1',
        purchases: [],
        rips: [{ id: 1, source_purchase_id: 99, realized_loss_cents: 500 }],
        decompositions: [],
      })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.realizedRipPnLCents).toBe(-500);
  });

  it('includes portfolioDelta7dCents, portfolioDelta7dPct, deltaCoverage fields', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 10,
        quantity: 2,
        cost_cents: 5000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    // No manual, then price was 5000
    mockFindManyCatalogItems.mockResolvedValue([{ id: 10, manualMarketCents: null }]);
    mockFindManyMarketPrices.mockResolvedValue([
      { catalogItemId: 10, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // now = 6000 * 2 = 12000, then = 5000 * 2 = 10000, delta = 2000
    expect(body.portfolioDelta7dCents).toBe(2000);
    // pct = (2000 / 10000) * 100 = 20.00
    expect(body.portfolioDelta7dPct).toBe(20);
    expect(body.deltaCoverage).toEqual({ covered: 1, total: 1 });
  });

  it('sets portfolioDelta7dCents null when no historical prices exist', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 20,
        quantity: 1,
        cost_cents: 4000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'New ETB',
          set_name: 'SV Base',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 4500,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    mockFindManyCatalogItems.mockResolvedValue([{ id: 20, manualMarketCents: null }]);
    mockFindManyMarketPrices.mockResolvedValue([]); // no historical rows

    const res = await GET();
    const body = await res.json();

    expect(body.portfolioDelta7dCents).toBeNull();
    expect(body.portfolioDelta7dPct).toBeNull();
    expect(body.deltaCoverage).toEqual({ covered: 0, total: 1 });
  });

  it('uses manualMarketCents as nowCents for portfolio delta', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 30,
        quantity: 1,
        cost_cents: 3000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
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
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    // Manual price = 7000 overrides lastMarketCents = 4000
    mockFindManyCatalogItems.mockResolvedValue([{ id: 30, manualMarketCents: 7000 }]);
    mockFindManyMarketPrices.mockResolvedValue([
      { catalogItemId: 30, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET();
    const body = await res.json();

    // nowCents = 7000 (manual), thenCents = 5000, qty = 1 → delta = 2000
    expect(body.portfolioDelta7dCents).toBe(2000);
    expect(body.deltaCoverage).toEqual({ covered: 1, total: 1 });
  });

  it('adds delta7dCents, delta7dPct, manualMarketCents to bestPerformers rows', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 40,
        quantity: 1,
        cost_cents: 4000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB A',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-29T00:00:00Z',
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    mockFindManyCatalogItems.mockResolvedValue([{ id: 40, manualMarketCents: null }]);
    mockFindManyMarketPrices.mockResolvedValue([
      { catalogItemId: 40, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.bestPerformers).toHaveLength(1);
    const bp = body.bestPerformers[0];
    expect(bp.delta7dCents).toBe(1000);
    expect(bp.delta7dPct).toBe(20);
    expect(bp.manualMarketCents).toBeNull();
  });

  it('folds sales realized P&L into realizedPnLCents', async () => {
    // 1 purchase qty 5 @ $20 each (cost_cents = 2000 per unit)
    // 1 sale qty 2 @ $30 each, fees $0
    // matched_cost_cents = 2000 (total cost matched for the 2-unit sale, i.e. 1000/unit * 2)
    // realizedSalesPnLCents = sale_price_cents - fees_cents - matched_cost_cents
    //                       = 3000 - 0 - 1000 = 2000
    // spec says: (3000 - 2000) * 2 = 2000; purchase cost is 2000 per unit so 2 units = 4000 matched
    // route formula: SUM(sale_price_cents - fees_cents - matched_cost_cents)
    // for result = 2000: sale_price_cents=3000, fees_cents=0, matched_cost_cents=1000
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 1,
        quantity: 5,
        cost_cents: 2000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: null,
          last_market_at: null,
        },
      },
    ];
    // Two separate sale rows, one unit each @ $3000 sale, $1000 matched cost (= $2000 purchase / 2 units)
    const sales = [
      {
        id: 10,
        purchase_id: 1,
        quantity: 1,
        sale_price_cents: 3000,
        fees_cents: 0,
        matched_cost_cents: 2000,
        sale_group_id: 'grp-1',
      },
      {
        id: 11,
        purchase_id: 1,
        quantity: 1,
        sale_price_cents: 3000,
        fees_cents: 0,
        matched_cost_cents: 2000,
        sale_group_id: 'grp-1',
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [], sales })
    );
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    // SUM((3000 - 0 - 2000) * 2 rows) = 2000
    expect(body.realizedSalesPnLCents).toBe(2000);
    expect(body.realizedPnLCents).toBe(2000);
  });
});
