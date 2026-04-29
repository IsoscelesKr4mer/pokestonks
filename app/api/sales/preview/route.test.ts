// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/sales/preview', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/sales/preview', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(makeReq({ catalogItemId: 'not-a-number' }) as never);
    expect(res.status).toBe(422);
  });

  it('returns ok:true with rows when qty available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // Stub Supabase: open lots, rips, decompositions, sales (each returns chainable thenable)
    const lotsRows = [
      { id: 100, quantity: 5, cost_cents: 5000, purchase_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' },
    ];
    mockFromBuilder.mockImplementation((table: string) => {
      const result = (() => {
        if (table === 'purchases') return lotsRows;
        if (table === 'rips') return [];
        if (table === 'box_decompositions') return [];
        if (table === 'sales') return [];
        return [];
      })();
      return {
        select: () => ({
          eq: () => ({
            is: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
          }),
          in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
          then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
        }),
      };
    });

    const res = await POST(
      makeReq({
        catalogItemId: 5,
        totalQty: 3,
        totalSalePriceCents: 18000,
        totalFeesCents: 0,
        saleDate: '2026-04-20',
      }) as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rows: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
  });

  it('returns 422 with insufficient_qty when not enough open lots', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromBuilder.mockImplementation((table: string) => {
      const result = (() => {
        if (table === 'purchases')
          return [{ id: 100, quantity: 1, cost_cents: 5000, purchase_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' }];
        return [];
      })();
      return {
        select: () => ({
          eq: () => ({
            is: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
          }),
          in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
          then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
        }),
      };
    });

    const res = await POST(
      makeReq({
        catalogItemId: 5,
        totalQty: 5,
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
});
