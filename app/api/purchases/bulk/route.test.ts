// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFrom, mockInsert, mockFindMany } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  const mockGetUser = vi.fn();
  const mockFindMany = vi.fn();
  return { mockGetUser, mockFrom, mockInsert, mockFindMany };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
  schema: {
    catalogItems: { id: 'id-col' },
  },
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://test/api/purchases/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/purchases/bulk', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockGetUser.mockReset();
    mockFindMany.mockReset();
    mockFrom.mockReturnValue({
      insert: mockInsert,
    });
  });

  it('rejects unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeReq({ items: [{ catalogItemId: 1, quantity: 1 }] }) as never);
    expect(res.status).toBe(401);
  });

  it('rejects empty items array', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    const res = await POST(makeReq({ items: [] }) as never);
    expect(res.status).toBe(422);
  });

  it('rejects > 200 items', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    const items = Array.from({ length: 201 }, () => ({ catalogItemId: 1, quantity: 1 }));
    const res = await POST(makeReq({ items }) as never);
    expect(res.status).toBe(422);
  });

  it('rejects when a catalogItemId does not exist', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    mockFindMany.mockResolvedValueOnce([{ id: 1 }]); // only id 1 exists
    const res = await POST(
      makeReq({
        items: [
          { catalogItemId: 1, quantity: 1 },
          { catalogItemId: 999, quantity: 1 },
        ],
      }) as never
    );
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts N rows all with unknown_cost=true and cost_cents=0', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    mockFindMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    mockInsert.mockReturnValueOnce({
      select: () => Promise.resolve({ data: [{ id: 10 }, { id: 11 }], error: null }),
    });
    const today = new Date().toISOString().slice(0, 10);
    const res = await POST(
      makeReq({
        items: [
          { catalogItemId: 1, quantity: 2, source: 'Walmart' },
          { catalogItemId: 2, quantity: 1 },
        ],
      }) as never
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.ids).toEqual([10, 11]);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        catalog_item_id: 1,
        quantity: 2,
        cost_cents: 0,
        unknown_cost: true,
        source: 'Walmart',
        purchase_date: today,
      }),
      expect.objectContaining({
        catalog_item_id: 2,
        quantity: 1,
        cost_cents: 0,
        unknown_cost: true,
        source: null,
      }),
    ]);
  });
});
