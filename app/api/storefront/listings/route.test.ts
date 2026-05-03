// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockLoadAdminView = vi.fn();
const mockCatalogFindFirst = vi.fn();
const mockUpsertReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/services/storefront', () => ({
  loadStorefrontAdminView: (userId: string) => mockLoadAdminView(userId),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findFirst: (a: unknown) => mockCatalogFindFirst(a),
      },
    },
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => mockUpsertReturning(),
        }),
      }),
    }),
  },
  schema: {
    storefrontListings: { userId: {}, catalogItemId: {}, askingPriceCents: {}, hidden: {}, updatedAt: {}, $inferInsert: {} },
    catalogItems: { id: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  sql: ((s: TemplateStringsArray) => s.raw.join('')) as unknown,
}));

import { GET, POST } from './route';

describe('GET /api/storefront/listings', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockLoadAdminView.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns all eligible holdings with override metadata', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockLoadAdminView.mockResolvedValueOnce([
      {
        catalogItemId: 100,
        override: {
          askingPriceCents: 6000,
          hidden: false,
          createdAt: new Date('2026-04-01'),
          updatedAt: new Date('2026-05-01'),
        },
        displayPriceCents: 6000,
        priceOrigin: 'manual' as const,
        item: {
          id: 100,
          name: 'SV151 ETB',
          setName: 'Scarlet & Violet 151',
          kind: 'sealed' as const,
          productType: 'Elite Trainer Box',
          imageUrl: null,
          imageStoragePath: null,
          lastMarketCents: 5499,
          lastMarketAt: new Date('2026-05-01'),
        },
        qtyHeldRaw: 3,
        typeLabel: 'Elite Trainer Box',
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].catalogItemId).toBe(100);
    expect(body.listings[0].askingPriceCents).toBe(6000);
    expect(body.listings[0].hidden).toBe(false);
    expect(body.listings[0].priceOrigin).toBe('manual');
    expect(body.listings[0].displayPriceCents).toBe(6000);
    expect(body.listings[0].qtyHeldRaw).toBe(3);
    expect(body.listings[0].typeLabel).toBe('Elite Trainer Box');
    expect(body.listings[0].createdAt).toBe('2026-04-01T00:00:00.000Z');
    expect(body.listings[0].updatedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('returns items with no override (opt-out semantics)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockLoadAdminView.mockResolvedValueOnce([
      {
        catalogItemId: 200,
        override: null,
        displayPriceCents: 5500,
        priceOrigin: 'auto' as const,
        item: {
          id: 200,
          name: 'Booster Box',
          setName: 'SV Base',
          kind: 'sealed' as const,
          productType: 'Booster Box',
          imageUrl: null,
          imageStoragePath: null,
          lastMarketCents: 5499,
          lastMarketAt: null,
        },
        qtyHeldRaw: 1,
        typeLabel: 'Booster Box',
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings[0].askingPriceCents).toBeNull();
    expect(body.listings[0].hidden).toBe(false);
    expect(body.listings[0].createdAt).toBeNull();
    expect(body.listings[0].updatedAt).toBeNull();
    expect(body.listings[0].priceOrigin).toBe('auto');
    expect(body.listings[0].displayPriceCents).toBe(5500);
  });

  it('returns hidden items with null display price and priceOrigin reflects what-would-render', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockLoadAdminView.mockResolvedValueOnce([
      {
        catalogItemId: 300,
        override: {
          askingPriceCents: null,
          hidden: true,
          createdAt: new Date('2026-04-01'),
          updatedAt: new Date('2026-05-01'),
        },
        displayPriceCents: null,
        priceOrigin: 'auto' as const,
        item: {
          id: 300,
          name: 'Hidden ETB',
          setName: null,
          kind: 'sealed' as const,
          productType: 'ETB',
          imageUrl: null,
          imageStoragePath: null,
          lastMarketCents: 4999,
          lastMarketAt: null,
        },
        qtyHeldRaw: 2,
        typeLabel: 'ETB',
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings[0].hidden).toBe(true);
    expect(body.listings[0].displayPriceCents).toBeNull();
    expect(body.listings[0].priceOrigin).toBe('auto');
  });
});

describe('POST /api/storefront/listings', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockCatalogFindFirst.mockReset();
    mockUpsertReturning.mockReset();
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({ catalogItemId: -1, askingPriceCents: 100 }) })
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when asking price exceeds the cap', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 1, askingPriceCents: 100_000_001 }),
      })
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when body has only catalogItemId (nothing to update)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 1 }),
      })
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 when catalog item missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce(null);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 999, askingPriceCents: 6000 }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('upserts the listing (full set)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce({ id: 100 });
    const now = new Date();
    mockUpsertReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 100, askingPriceCents: 6000, hidden: false }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.askingPriceCents).toBe(6000);
    expect(body.listing.hidden).toBe(false);
  });

  it('returns 200 for hide-only update', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce({ id: 1 });
    const now = new Date();
    mockUpsertReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 1,
        askingPriceCents: null,
        hidden: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 1, hidden: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.hidden).toBe(true);
    expect(body.listing.askingPriceCents).toBeNull();
  });

  it('returns 200 for clear override (askingPriceCents: null)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce({ id: 1 });
    const now = new Date();
    mockUpsertReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 1,
        askingPriceCents: null,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 1, askingPriceCents: null }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.askingPriceCents).toBeNull();
  });
});
