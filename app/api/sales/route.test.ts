// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();
const mockTransaction = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
  },
  schema: {},
}));

import { POST, GET } from './route';

function makePostReq(body: unknown) {
  return new Request('http://localhost/api/sales', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
    mockTransaction.mockReset();
    mockInsertReturning.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makePostReq({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 on validation failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(makePostReq({ catalogItemId: 'bad' }) as never);
    expect(res.status).toBe(422);
  });

  it('returns 422 with insufficient_qty when not enough open lots', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromBuilder.mockImplementation((table: string) => {
      const result = (() => {
        if (table === 'purchases')
          return [{ id: 100, quantity: 1, cost_cents: 5000, purchase_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' }];
        return [];
      })();
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        gte: () => chain,
        lte: () => chain,
        ilike: () => chain,
        order: () => chain,
        range: () => chain,
        then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
      };
      return chain;
    });

    const res = await POST(
      makePostReq({
        catalogItemId: 5,
        totalQty: 5,  // requesting more than available (1)
        totalSalePriceCents: 30000,
        totalFeesCents: 0,
        saleDate: '2026-04-20',
      }) as never
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: false; reason: string; totalAvailable: number };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('insufficient_qty');
    expect(body.totalAvailable).toBe(1);
  });

  // Note: full happy path is exercised in browser smoke. Mocking Drizzle
  // transactions requires substantial setup; we cover the matcher + insert
  // wiring via integration in the live env. Here we validate the edge cases
  // that don't depend on tx behavior.
});

describe('GET /api/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost/api/sales') as never);
    expect(res.status).toBe(401);
  });

  it('returns grouped sale events', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const rows = [
      {
        id: 1, sale_group_id: 'g1', purchase_id: 100, sale_date: '2026-04-20',
        quantity: 2, sale_price_cents: 40000, fees_cents: 1600, matched_cost_cents: 11000,
        platform: 'eBay', notes: null, created_at: '2026-04-20T00:00:00Z',
        purchase: { id: 100, purchase_date: '2026-03-01', cost_cents: 5500, unknown_cost: false, catalog_item: { id: 5, name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed', image_url: null, image_storage_path: null } },
      },
      {
        id: 2, sale_group_id: 'g1', purchase_id: 200, sale_date: '2026-04-20',
        quantity: 1, sale_price_cents: 20000, fees_cents: 800, matched_cost_cents: 5500,
        platform: 'eBay', notes: null, created_at: '2026-04-20T00:00:00Z',
        purchase: { id: 200, purchase_date: '2026-04-12', cost_cents: 5500, unknown_cost: false, catalog_item: { id: 5, name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed', image_url: null, image_storage_path: null } },
      },
    ];
    mockFromBuilder.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        ilike: () => chain,
        order: () => chain,
        range: () => chain,
        then: (cb: (v: unknown) => unknown) => cb({ data: rows, error: null }),
      };
      return chain;
    });

    const res = await GET(new Request('http://localhost/api/sales') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sales: { saleGroupId: string; rows: unknown[] }[] };
    expect(body.sales).toHaveLength(1);
    expect(body.sales[0].saleGroupId).toBe('g1');
    expect(body.sales[0].rows).toHaveLength(2);
  });
});
