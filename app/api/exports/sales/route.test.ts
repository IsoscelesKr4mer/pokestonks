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

import { GET } from './route';

describe('GET /api/exports/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(401);
  });

  it('returns CSV with header row and one data row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const rows = [
      {
        id: 1, sale_group_id: 'g1', sale_date: '2026-04-20', purchase_id: 100,
        quantity: 2, sale_price_cents: 40000, fees_cents: 1600, matched_cost_cents: 11000,
        platform: 'eBay', notes: 'with,comma',
        purchase: {
          purchase_date: '2026-03-01', cost_cents: 5500,
          catalog_item: { name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed' },
        },
      },
    ];
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, order: () => chain,
      then: (cb: (v: unknown) => unknown) => cb({ data: rows, error: null }),
    };
    mockFromBuilder.mockReturnValue(chain);

    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('sale_group_id,sale_id,sale_date,holding_name,set_name,product_type,kind,purchase_id,purchase_date,qty,per_unit_cost_cents,sale_price_cents,fees_cents,matched_cost_cents,realized_pnl_cents,platform,notes');
    expect(lines[1]).toContain('"with,comma"');
    expect(lines[1]).toContain('27400');  // 40000 - 1600 - 11000
  });
});
