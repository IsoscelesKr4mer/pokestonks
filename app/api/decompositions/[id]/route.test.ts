// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Mock infrastructure
// -----------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockDecompFindFirst = vi.fn();
const mockPurchasesFindFirst = vi.fn();
const mockPurchasesFindMany = vi.fn();
const mockCatalogItemsFindFirst = vi.fn();
const mockCatalogItemsFindMany = vi.fn();
const mockTransaction = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => mockSupabaseFrom(table),
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      boxDecompositions: { findFirst: (a: unknown) => mockDecompFindFirst(a) },
      purchases: {
        findFirst: (a: unknown) => mockPurchasesFindFirst(a),
        findMany: (a: unknown) => mockPurchasesFindMany(a),
      },
      catalogItems: {
        findFirst: (a: unknown) => mockCatalogItemsFindFirst(a),
        findMany: (a: unknown) => mockCatalogItemsFindMany(a),
      },
    },
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  },
  schema: {
    boxDecompositions: { id: {}, userId: {} },
    purchases: { id: {}, sourceDecompositionId: {}, deletedAt: {}, catalogItemId: {} },
    catalogItems: { id: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  isNull: (x: unknown) => ({ _op: 'isNull', x }),
}));

import { GET, DELETE } from './route';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const baseDecomp = {
  id: 1,
  userId: 'test-user',
  sourcePurchaseId: 10,
  decomposeDate: '2026-05-02',
  sourceCostCents: 6000,
  packCount: 3,
  perPackCostCents: 2000,
  roundingResidualCents: 0,
  notes: null,
  createdAt: new Date().toISOString(),
};

const baseSourcePurchase = { id: 10, catalogItemId: 99, quantity: 1, costCents: 6000, purchaseDate: '2026-05-02' };
const baseSourceItem = { id: 99, name: 'Mega ex Box', imageUrl: null, setName: null, productType: 'Mega ex Box' };

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('GET /api/decompositions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      new NextRequest('http://test/api/decompositions/1'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when decomposition not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockDecompFindFirst.mockResolvedValue(null);
    const res = await GET(
      new NextRequest('http://test/api/decompositions/999'),
      { params: Promise.resolve({ id: '999' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns ALL child purchases (mixed packs + cards)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    const packItem = { id: 1, name: 'Mega Booster Pack', imageUrl: null, setName: null, kind: 'sealed', productType: 'Booster Pack' };
    const cardItem = { id: 2, name: 'Mega Pikachu Promo', imageUrl: null, setName: null, kind: 'card', productType: null };

    mockDecompFindFirst.mockResolvedValue(baseDecomp);
    mockPurchasesFindFirst.mockResolvedValue(baseSourcePurchase);
    mockCatalogItemsFindFirst.mockResolvedValue(baseSourceItem);
    mockPurchasesFindMany.mockResolvedValue([
      { id: 10, catalogItemId: packItem.id, quantity: 3, costCents: 2000, unknownCost: false },
      { id: 11, catalogItemId: cardItem.id, quantity: 1, costCents: 0, unknownCost: false },
    ]);
    mockCatalogItemsFindMany.mockResolvedValue([packItem, cardItem]);

    const res = await GET(
      new NextRequest(`http://test/api/decompositions/${baseDecomp.id}`),
      { params: Promise.resolve({ id: String(baseDecomp.id) }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childPurchases).toHaveLength(2);
    expect(body.childCatalogItems).toHaveLength(2);
    const packChild = body.childPurchases.find((p: { catalogItemId: number }) => p.catalogItemId === packItem.id);
    const cardChild = body.childPurchases.find((p: { catalogItemId: number }) => p.catalogItemId === cardItem.id);
    expect(packChild.costCents).toBe(2000);
    expect(cardChild.costCents).toBe(0);
  });
});

describe('DELETE /api/decompositions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      new NextRequest('http://test/api/decompositions/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when decomposition not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockDecompFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest('http://test/api/decompositions/999', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '999' }) }
    );
    expect(res.status).toBe(404);
  });

  it('blocks undo when ANY child has linked sales (not just the first)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    const packChild = { id: 20, catalogItemId: 1, quantity: 3, costCents: 2000, unknownCost: false, sourceDecompositionId: 1 };
    const cardChild = { id: 21, catalogItemId: 2, quantity: 1, costCents: 0, unknownCost: false, sourceDecompositionId: 1 };

    mockDecompFindFirst.mockResolvedValue(baseDecomp);
    // findMany for children
    mockPurchasesFindMany.mockResolvedValue([packChild, cardChild]);

    // Supabase calls: rips check + sales check
    // rips: no linked rips
    // sales: the card child has a sale
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'rips') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'sales') {
        return {
          select: () => ({
            in: (_col: string, ids: number[]) => {
              // cardChild.id === 21 has a sale
              if (ids.includes(21)) {
                return Promise.resolve({ data: [{ id: 500 }], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          }),
        };
      }
      return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
    });

    const res = await DELETE(
      new NextRequest(`http://test/api/decompositions/${baseDecomp.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(baseDecomp.id) }) }
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/linked sales/i);
  });

  it('successfully deletes and returns 204 when no linked rips or sales', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockDecompFindFirst.mockResolvedValue(baseDecomp);
    mockPurchasesFindMany.mockResolvedValue([
      { id: 20, catalogItemId: 1, quantity: 3, costCents: 2000, unknownCost: false },
    ]);

    mockSupabaseFrom.mockImplementation(() => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }));

    mockTransaction.mockImplementation(async (cb: (tx: {
      update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => Promise<void> } };
      delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
    }) => unknown) => {
      const tx = {
        update: () => ({ set: () => ({ where: async () => {} }) }),
        delete: () => ({ where: async () => {} }),
      };
      return cb(tx);
    });

    const res = await DELETE(
      new NextRequest(`http://test/api/decompositions/${baseDecomp.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(baseDecomp.id) }) }
    );
    expect(res.status).toBe(204);
  });
});
