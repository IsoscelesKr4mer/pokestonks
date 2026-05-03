// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Mock infrastructure
// -----------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockTransaction = vi.fn();
const mockPurchasesFindFirst = vi.fn();
const mockCatalogItemsFindFirst = vi.fn();
const mockCatalogItemsFindMany = vi.fn();
const mockCompositionsFindMany = vi.fn();
// The select chain is used to count rips and decompositions.
// We set up a call counter to distinguish the two calls.
let selectCallCount = 0;
let mockRipCount = 0;
let mockDecompCount = 0;
const mockSelectChain = {
  from: () => ({
    where: () => {
      selectCallCount++;
      if (selectCallCount % 2 === 1) {
        // First select per request = rips
        return Promise.resolve([{ ripped: mockRipCount }]);
      }
      // Second select per request = decompositions
      return Promise.resolve([{ decomposed: mockDecompCount }]);
    },
  }),
};

// Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

// Drizzle db
vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      purchases: { findFirst: (a: unknown) => mockPurchasesFindFirst(a) },
      catalogItems: {
        findFirst: (a: unknown) => mockCatalogItemsFindFirst(a),
        findMany: (a: unknown) => mockCatalogItemsFindMany(a),
      },
      catalogPackCompositions: { findMany: (a: unknown) => mockCompositionsFindMany(a) },
    },
    select: () => mockSelectChain,
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  schema: {
    purchases: { id: {}, userId: {}, sourceDecompositionId: {}, deletedAt: {} },
    catalogItems: { id: {}, kind: {}, productType: {} },
    catalogPackCompositions: { sourceCatalogItemId: {}, contentsCatalogItemId: {}, displayOrder: {}, id: {} },
    rips: { sourcePurchaseId: {} },
    boxDecompositions: { sourcePurchaseId: {}, id: {}, userId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  count: () => ({ _col: 'count' }),
  asc: (x: unknown) => x,
  inArray: (a: unknown, b: unknown) => ({ _op: 'inArray', a, b }),
}));

vi.mock('@/lib/services/tcgcsv', () => ({
  DETERMINISTIC_DECOMPOSITION_TYPES: new Set(['Elite Trainer Box', 'Booster Box', 'Tin']),
}));

import { POST } from './route';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeReq(body: unknown) {
  return new NextRequest('http://test/api/decompositions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseUser = { id: 'test-user' };
const basePurchase = {
  id: 1,
  userId: 'test-user',
  catalogItemId: 10,
  quantity: 1,
  costCents: 6000,
  unknownCost: false,
  deletedAt: null,
};
const baseSourceItem = {
  id: 10,
  kind: 'sealed' as const,
  productType: 'Mega ex Box',
  setCode: null,
  setName: null,
  packCount: null,
};

function makeTxMock(overrides: {
  decompId?: number;
  children?: Array<{ id: number; catalogItemId: number; quantity: number; costCents: number; unknownCost: boolean }>;
} = {}) {
  const decomp = { id: overrides.decompId ?? 50 };
  const children = overrides.children ?? [];
  let childIdx = 0;
  return async (cb: (tx: {
    insert: (t: unknown) => { values: (v: { catalogItemId?: number; sourcePurchaseId?: number }) => { returning: () => Promise<unknown[]> } };
    delete: (t: unknown) => { where: (c: unknown) => Promise<void> };
  }) => unknown) => {
    const tx = {
      insert: () => ({
        values: (vals: { catalogItemId?: number; sourcePurchaseId?: number }) => ({
          returning: async (): Promise<unknown[]> => {
            // Decomposition row detection: has sourcePurchaseId, no catalogItemId
            if (vals.sourcePurchaseId !== undefined && vals.catalogItemId === undefined) {
              return [decomp];
            }
            // Composition row: has sourceCatalogItemId -> just return empty
            if ((vals as { sourceCatalogItemId?: number }).sourceCatalogItemId !== undefined) {
              return [{ id: 1 }];
            }
            // Child purchase
            if (children.length > 0 && childIdx < children.length) {
              const child = children[childIdx];
              // match by catalogItemId if possible
              const match = children.find(c => c.catalogItemId === vals.catalogItemId);
              if (match) return [match];
              const c = children[childIdx++];
              return [c];
            }
            return [{ id: childIdx++, catalogItemId: vals.catalogItemId, quantity: 1, costCents: 0, unknownCost: false }];
          },
        }),
      }),
      delete: () => ({ where: async () => {} }),
    };
    return cb(tx);
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('POST /api/decompositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    mockRipCount = 0;
    mockDecompCount = 0;
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 422 on validation failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const res = await POST(makeReq({ sourcePurchaseId: 'bad' }));
    expect(res.status).toBe(422);
  });

  it('returns 404 when source purchase not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    mockPurchasesFindFirst.mockResolvedValue(null);
    const res = await POST(makeReq({ sourcePurchaseId: 999, recipe: [{ contentsCatalogItemId: 1, quantity: 1 }] }));
    expect(res.status).toBe(404);
  });

  it('creates a card child purchase with cost_cents=0 for a card recipe row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const packItem = { id: 20, kind: 'sealed' as const, productType: 'Booster Pack', name: 'Test Pack' };
    const cardItem = { id: 30, kind: 'card' as const, productType: null, name: 'Test Promo' };

    mockPurchasesFindFirst.mockResolvedValue(basePurchase);
    mockCatalogItemsFindFirst.mockResolvedValueOnce(baseSourceItem); // sourceItem
    mockCatalogItemsFindMany.mockResolvedValue([packItem, cardItem]); // contents bulk lookup
    mockCompositionsFindMany.mockResolvedValue([]);

    mockTransaction.mockImplementation(makeTxMock({
      children: [
        { id: 100, catalogItemId: packItem.id, quantity: 3, costCents: 2000, unknownCost: false },
        { id: 101, catalogItemId: cardItem.id, quantity: 1, costCents: 0, unknownCost: false },
      ],
    }));

    const res = await POST(makeReq({
      sourcePurchaseId: basePurchase.id,
      recipe: [
        { contentsCatalogItemId: packItem.id, quantity: 3 },
        { contentsCatalogItemId: cardItem.id, quantity: 1 },
      ],
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.packPurchases).toHaveLength(2);
    const pack = body.packPurchases.find((p: { catalogItemId: number }) => p.catalogItemId === packItem.id);
    const card = body.packPurchases.find((p: { catalogItemId: number }) => p.catalogItemId === cardItem.id);
    expect(pack.costCents).toBe(2000); // 6000 / 3 packs = 2000 each
    expect(pack.quantity).toBe(3);
    expect(card.costCents).toBe(0); // freebie
    expect(card.quantity).toBe(1);
  });

  it('rejects a recipe with no sealed rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const cardA = { id: 30, kind: 'card' as const, productType: null, name: 'Card A' };
    const cardB = { id: 31, kind: 'card' as const, productType: null, name: 'Card B' };

    mockPurchasesFindFirst.mockResolvedValue({ ...basePurchase, costCents: 2000 });
    mockCatalogItemsFindFirst.mockResolvedValueOnce(baseSourceItem);
    mockCatalogItemsFindMany.mockResolvedValue([cardA, cardB]);
    mockCompositionsFindMany.mockResolvedValue([]);

    const res = await POST(makeReq({
      sourcePurchaseId: basePurchase.id,
      recipe: [
        { contentsCatalogItemId: cardA.id, quantity: 1 },
        { contentsCatalogItemId: cardB.id, quantity: 1 },
      ],
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('recipe_must_contain_sealed_row');
  });

  it('rejects a circular recipe (contents == source)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const sourceItem = { id: 10, kind: 'sealed' as const, productType: 'Booster Box', setCode: null, setName: null, packCount: null };

    mockPurchasesFindFirst.mockResolvedValue({ ...basePurchase, catalogItemId: sourceItem.id, costCents: 12000 });
    mockCatalogItemsFindFirst.mockResolvedValueOnce(sourceItem);
    mockCompositionsFindMany.mockResolvedValue([]);

    const res = await POST(makeReq({
      sourcePurchaseId: basePurchase.id,
      recipe: [{ contentsCatalogItemId: sourceItem.id, quantity: 1 }],
    }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('circular_recipe');
  });

  it('inherits unknown_cost from the source on both pack and card children', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const packItem = { id: 20, kind: 'sealed' as const, productType: 'Booster Pack', name: 'Test Pack' };
    const cardItem = { id: 30, kind: 'card' as const, productType: null, name: 'Test Promo' };

    mockPurchasesFindFirst.mockResolvedValue({ ...basePurchase, costCents: 0, unknownCost: true });
    mockCatalogItemsFindFirst.mockResolvedValueOnce(baseSourceItem);
    mockCatalogItemsFindMany.mockResolvedValue([packItem, cardItem]);
    mockCompositionsFindMany.mockResolvedValue([]);

    mockTransaction.mockImplementation(makeTxMock({
      children: [
        { id: 100, catalogItemId: packItem.id, quantity: 3, costCents: 0, unknownCost: true },
        { id: 101, catalogItemId: cardItem.id, quantity: 1, costCents: 0, unknownCost: true },
      ],
    }));

    const res = await POST(makeReq({
      sourcePurchaseId: basePurchase.id,
      recipe: [
        { contentsCatalogItemId: packItem.id, quantity: 3 },
        { contentsCatalogItemId: cardItem.id, quantity: 1 },
      ],
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    for (const child of body.packPurchases) {
      expect(child.unknownCost).toBe(true);
      expect(child.costCents).toBe(0);
    }
  });

  it('two-stage: Case -> Box children with correct per-unit cost', async () => {
    mockGetUser.mockResolvedValue({ data: { user: baseUser } });
    const boxItem = { id: 50, kind: 'sealed' as const, productType: 'Booster Box', name: 'Test Box' };
    const casePurchase = { id: 5, userId: 'test-user', catalogItemId: 60, quantity: 1, costCents: 72000, unknownCost: false, deletedAt: null };
    const caseItem = { id: 60, kind: 'sealed' as const, productType: 'Booster Box Case', setCode: null, setName: null, packCount: null };

    mockPurchasesFindFirst.mockResolvedValue(casePurchase);
    mockCatalogItemsFindFirst.mockResolvedValueOnce(caseItem);
    mockCatalogItemsFindMany.mockResolvedValue([boxItem]);
    mockCompositionsFindMany.mockResolvedValue([]);

    mockTransaction.mockImplementation(makeTxMock({
      children: [
        { id: 200, catalogItemId: boxItem.id, quantity: 6, costCents: 12000, unknownCost: false },
      ],
    }));

    const res = await POST(makeReq({
      sourcePurchaseId: casePurchase.id,
      recipe: [{ contentsCatalogItemId: boxItem.id, quantity: 6 }],
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    const boxChildResult = body.packPurchases[0];
    expect(boxChildResult.catalogItemId).toBe(boxItem.id);
    expect(boxChildResult.quantity).toBe(6);
    expect(boxChildResult.costCents).toBe(12000); // 72000 / 6
  });
});
