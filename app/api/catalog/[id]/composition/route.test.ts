// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockCatalogItemFindFirst = vi.fn();
const mockCompositionFindMany = vi.fn();
const mockCatalogItemFindMany = vi.fn();

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
  },
  schema: {
    catalogItems: {},
    catalogPackCompositions: { sourceCatalogItemId: {}, displayOrder: {}, id: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => [a, b],
  asc: (x: unknown) => x,
}));

import { GET } from './route';

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
      { packCatalogItemId: 99, quantity: 1, displayOrder: 0, id: 1 },
    ]);
    mockCatalogItemFindMany.mockResolvedValueOnce([
      { id: 99, name: 'Phantasmal Flames Booster Pack', setName: 'Phantasmal Flames', imageUrl: null },
    ]);
    const res = await GET(new Request('http://localhost') as never, makeCtx('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(true);
    expect(body.suggested).toBe(false);
    expect(body.recipe).toEqual([
      {
        packCatalogItemId: 99,
        quantity: 1,
        packName: 'Phantasmal Flames Booster Pack',
        packSetName: 'Phantasmal Flames',
        packImageUrl: null,
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
});
