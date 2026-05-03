// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockCatalogFindFirst,
  mockCatalogFindMany,
  mockPurchasesFindMany,
  mockRipsFindMany,
  mockBoxDecompFindMany,
  mockSalesFindMany,
  mockMarketPricesFindMany,
  mockStorefrontListingsFindFirst,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCatalogFindFirst: vi.fn(),
  mockCatalogFindMany: vi.fn(),
  mockPurchasesFindMany: vi.fn(),
  mockRipsFindMany: vi.fn(),
  mockBoxDecompFindMany: vi.fn(),
  mockSalesFindMany: vi.fn(),
  mockMarketPricesFindMany: vi.fn(),
  mockStorefrontListingsFindFirst: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: { findFirst: mockCatalogFindFirst, findMany: mockCatalogFindMany },
      purchases: { findMany: mockPurchasesFindMany },
      rips: { findMany: mockRipsFindMany },
      boxDecompositions: { findMany: mockBoxDecompFindMany },
      sales: { findMany: mockSalesFindMany },
      marketPrices: { findMany: mockMarketPricesFindMany },
      storefrontListings: { findFirst: mockStorefrontListingsFindFirst },
    },
  },
  schema: {
    catalogItems: { id: 'id', manualMarketCents: 'manual_market_cents' },
    purchases: { userId: 'user_id', catalogItemId: 'catalog_item_id', deletedAt: 'deleted_at', id: 'id', sourceRipId: 'source_rip_id' },
    rips: { id: 'id', sourcePurchaseId: 'source_purchase_id' },
    boxDecompositions: { id: 'id', sourcePurchaseId: 'source_purchase_id' },
    sales: { userId: 'user_id', purchaseId: 'purchase_id' },
    marketPrices: { catalogItemId: 'catalog_item_id', snapshotDate: 'snapshot_date' },
  },
}));

vi.mock('@/lib/api/holdingDetailDto', () => ({
  buildActivityEvents: vi.fn(() => []),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ITEM_ID = '42';
const makeRequest = () => new NextRequest(`http://localhost/api/holdings/${ITEM_ID}`);
const makeCtx = (id = ITEM_ID) => ({ params: Promise.resolve({ catalogItemId: id }) });

const baseCatalogItem = {
  id: 42,
  kind: 'sealed' as const,
  name: 'SV151 ETB',
  setName: 'SV151',
  setCode: 'sv3pt5',
  productType: 'ETB',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  imageStoragePath: null,
  lastMarketCents: 6000,
  lastMarketAt: new Date('2026-04-29T00:00:00Z'),
  msrpCents: null,
  packCount: null,
  manualMarketCents: null,
  manualMarketAt: null,
  tcgplayerProductId: null,
};

function setupDefaults() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockCatalogFindFirst.mockResolvedValue(baseCatalogItem);
  mockPurchasesFindMany.mockResolvedValue([]);
  mockRipsFindMany.mockResolvedValue([]);
  mockBoxDecompFindMany.mockResolvedValue([]);
  mockSalesFindMany.mockResolvedValue([]);
  mockCatalogFindMany.mockResolvedValue([{ id: 42, manualMarketCents: null }]);
  mockMarketPricesFindMany.mockResolvedValue([]);
  mockStorefrontListingsFindFirst.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/holdings/[catalogItemId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockCatalogFindFirst.mockResolvedValue(baseCatalogItem);
    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns 400 for non-numeric id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const res = await GET(makeRequest(), makeCtx('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid id');
  });

  it('returns 404 when catalog item not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockCatalogFindFirst.mockResolvedValue(undefined);
    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(404);
  });

  it('returns null delta fields when no historical price exists', async () => {
    setupDefaults();

    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.holding.delta7dCents).toBeNull();
    expect(body.holding.delta7dPct).toBeNull();
    expect(body.holding.manualMarketCents).toBeNull();
  });

  it('includes delta7dCents, delta7dPct, manualMarketCents on holding', async () => {
    setupDefaults();

    // lastMarketCents = 6000, then = 5000
    mockMarketPricesFindMany.mockResolvedValue([
      { catalogItemId: 42, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    // delta = 6000 - 5000 = 1000, pct = 20.00
    expect(body.holding.delta7dCents).toBe(1000);
    expect(body.holding.delta7dPct).toBe(20);
    expect(body.holding.manualMarketCents).toBeNull();
  });

  it('uses manualMarketCents as nowCents when set', async () => {
    setupDefaults();

    // Manual price override = 7000
    mockCatalogFindMany.mockResolvedValue([{ id: 42, manualMarketCents: 7000 }]);
    // Then = 5000
    mockMarketPricesFindMany.mockResolvedValue([
      { catalogItemId: 42, snapshotDate: '2026-04-23', marketPriceCents: 5000 },
    ]);

    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    // nowCents = 7000 (manual), thenCents = 5000 → delta = 2000
    expect(body.holding.delta7dCents).toBe(2000);
    expect(body.holding.manualMarketCents).toBe(7000);
  });

  it('response includes item, holding, lots, rips, decompositions, sales', async () => {
    setupDefaults();

    const res = await GET(makeRequest(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('item');
    expect(body).toHaveProperty('holding');
    expect(body).toHaveProperty('lots');
    expect(body).toHaveProperty('rips');
    expect(body).toHaveProperty('decompositions');
    expect(body).toHaveProperty('sales');
    expect(body.item.id).toBe(42);
  });
});
