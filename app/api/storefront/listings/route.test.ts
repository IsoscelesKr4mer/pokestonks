// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockListingsFindMany = vi.fn();
const mockCatalogFindMany = vi.fn();
const mockCatalogFindFirst = vi.fn();
const mockUpsertReturning = vi.fn();
const mockLoadView = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/services/storefront', () => ({
  loadStorefrontView: (userId: string) => mockLoadView(userId),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      storefrontListings: { findMany: (a: unknown) => mockListingsFindMany(a) },
      catalogItems: {
        findFirst: (a: unknown) => mockCatalogFindFirst(a),
        findMany: (a: unknown) => mockCatalogFindMany(a),
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
    storefrontListings: { userId: {}, catalogItemId: {}, askingPriceCents: {}, updatedAt: {} },
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
    mockListingsFindMany.mockReset();
    mockCatalogFindMany.mockReset();
    mockLoadView.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns listings joined to catalog and view fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockListingsFindMany.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-05-01'),
      },
    ]);
    mockCatalogFindMany.mockResolvedValueOnce([
      {
        id: 100,
        name: 'SV151 ETB',
        setName: 'Scarlet & Violet 151',
        kind: 'sealed',
        productType: 'Elite Trainer Box',
        imageUrl: null,
        imageStoragePath: null,
        lastMarketCents: 5499,
        lastMarketAt: new Date('2026-05-01'),
      },
    ]);
    mockLoadView.mockResolvedValueOnce({
      items: [
        {
          catalogItemId: 100,
          name: 'SV151 ETB',
          setName: 'Scarlet & Violet 151',
          imageUrl: null,
          imageStoragePath: null,
          typeLabel: 'Elite Trainer Box',
          qtyAvailable: 3,
          askingPriceCents: 6000,
          updatedAt: new Date('2026-05-01'),
        },
      ],
      itemsCount: 1,
      lastUpdatedAt: new Date('2026-05-01'),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].catalogItemId).toBe(100);
    expect(body.listings[0].askingPriceCents).toBe(6000);
    expect(body.listings[0].qtyHeldRaw).toBe(3);
    expect(body.listings[0].typeLabel).toBe('Elite Trainer Box');
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

  it('upserts the listing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce({ id: 100 });
    const now = new Date();
    mockUpsertReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 100, askingPriceCents: 6000 }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.askingPriceCents).toBe(6000);
  });
});
