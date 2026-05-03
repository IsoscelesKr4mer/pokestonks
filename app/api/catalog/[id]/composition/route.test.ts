// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockCatalogItemFindFirst = vi.fn();
const mockCompositionFindMany = vi.fn();
const mockCatalogItemFindMany = vi.fn();
const mockCompositionDelete = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findFirst: (args: unknown) => mockCatalogItemFindFirst(args),
        findMany: (args: unknown) => mockCatalogItemFindMany(args),
      },
      catalogPackCompositions: {
        findMany: (args: unknown) => mockCompositionFindMany(args),
      },
    },
    delete: () => ({
      where: (cond: unknown) => ({
        returning: (cols?: unknown) => mockCompositionDelete(cond, cols),
      }),
    }),
  },
  schema: {
    catalogItems: {},
    catalogPackCompositions: { sourceCatalogItemId: {}, displayOrder: {}, id: {}, contentsCatalogItemId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => [a, b],
  asc: (x: unknown) => x,
}));

import { GET, DELETE } from './route';

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/catalog/[id]/composition', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockCatalogItemFindFirst.mockReset();
    mockCompositionFindMany.mockReset();
    mockCatalogItemFindMany.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never, makeCtx('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when catalog item not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://localhost') as never, makeCtx('999'));
    expect(res.status).toBe(404);
  });

  it('returns persisted recipe when one exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce({
      id: 5,
      name: 'Mini Portfolio',
      kind: 'sealed',
      productType: 'Mini Portfolio',
      packCount: 1,
      setCode: null,
      setName: null,
    });
    mockCompositionFindMany.mockResolvedValueOnce([
      { contentsCatalogItemId: 99, quantity: 1, displayOrder: 0, id: 1 },
    ]);
    mockCatalogItemFindMany.mockResolvedValueOnce([
      { id: 99, name: 'Phantasmal Flames Booster Pack', setName: 'Phantasmal Flames', imageUrl: null, kind: 'sealed', productType: 'Booster Pack' },
    ]);
    const res = await GET(new Request('http://localhost') as never, makeCtx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(true);
    expect(body.suggested).toBe(false);
    expect(body.recipe).toEqual([
      {
        contentsCatalogItemId: 99,
        quantity: 1,
        contentsName: 'Phantasmal Flames Booster Pack',
        contentsSetName: 'Phantasmal Flames',
        contentsImageUrl: null,
        contentsKind: 'sealed',
        contentsProductType: 'Booster Pack',
      },
    ]);
  });

  it('returns null recipe when no saved + no same-set pack', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogItemFindFirst
      .mockResolvedValueOnce({
        id: 5,
        name: 'Mini Portfolio',
        kind: 'sealed',
        productType: 'Mini Portfolio',
        packCount: 1,
        setCode: null,
        setName: null,
      })
      .mockResolvedValueOnce(null); // no same-set Booster Pack
    mockCompositionFindMany.mockResolvedValueOnce([]);
    const res = await GET(new Request('http://localhost') as never, makeCtx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.suggested).toBe(false);
    expect(body.recipe).toBeNull();
  });

  it('returns contentsKind and contentsProductType for each saved recipe row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce({
      id: 5,
      name: 'Mega ex Box',
      kind: 'sealed',
      productType: 'Mega ex Box',
      packCount: 3,
      setCode: null,
      setName: null,
    });
    mockCompositionFindMany.mockResolvedValueOnce([
      { contentsCatalogItemId: 99, quantity: 3, displayOrder: 0, id: 1 },
      { contentsCatalogItemId: 88, quantity: 1, displayOrder: 1, id: 2 },
    ]);
    mockCatalogItemFindMany.mockResolvedValueOnce([
      { id: 99, name: 'Mega Booster Pack', setName: 'Mega Evolution', imageUrl: null, kind: 'sealed', productType: 'Booster Pack' },
      { id: 88, name: 'Mega Pikachu Promo', setName: 'Mega Evolution', imageUrl: null, kind: 'card', productType: null },
    ]);

    const res = await GET(new Request('http://localhost') as never, makeCtx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(true);
    expect(body.recipe).toHaveLength(2);
    const pack = body.recipe.find((r: { contentsCatalogItemId: number }) => r.contentsCatalogItemId === 99);
    const card = body.recipe.find((r: { contentsCatalogItemId: number }) => r.contentsCatalogItemId === 88);
    expect(pack.contentsKind).toBe('sealed');
    expect(pack.contentsProductType).toBe('Booster Pack');
    expect(card.contentsKind).toBe('card');
    expect(card.contentsProductType).toBeNull();
  });
});

describe('DELETE /api/catalog/[id]/composition', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockCatalogItemFindFirst.mockReset();
    mockCompositionDelete.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      new Request('http://test/api/catalog/1/composition', { method: 'DELETE' }) as never,
      makeCtx('1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the catalog item does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(
      new Request('http://test/api/catalog/99999/composition', { method: 'DELETE' }) as never,
      makeCtx('99999')
    );
    expect(res.status).toBe(404);
  });

  it('deletes all rows for the source and returns the count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce({ id: 5, name: 'Mega ex Box', kind: 'sealed' });
    // Mock the delete().where() chain to return array with 2 items
    mockCompositionDelete.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const res = await DELETE(
      new Request('http://test/api/catalog/5/composition', { method: 'DELETE' }) as never,
      makeCtx('5')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });

  it('is idempotent - empty source returns deleted: 0', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockCatalogItemFindFirst.mockResolvedValueOnce({ id: 5, name: 'Mega ex Box', kind: 'sealed' });
    mockCompositionDelete.mockResolvedValue([]);

    const res = await DELETE(
      new Request('http://test/api/catalog/5/composition', { method: 'DELETE' }) as never,
      makeCtx('5')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });
});
