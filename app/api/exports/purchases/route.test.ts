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

describe('GET /api/exports/purchases', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe('unauthorized');
  });

  it('returns CSV with header row and one data row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const rows = [
      {
        id: 42,
        purchase_date: '2026-04-01',
        quantity: 2,
        cost_cents: 5999,
        source: 'Walmart vending',
        location: 'Dallas, TX',
        condition: 'NM',
        is_graded: false,
        grading_company: null,
        grade: null,
        cert_number: null,
        source_rip_id: null,
        source_decomposition_id: null,
        notes: 'first buy, special',
        created_at: '2026-04-01T12:00:00Z',
        catalog_item: {
          name: 'Scarlet & Violet 151 ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          kind: 'sealed',
        },
      },
    ];
    const chain = {
      select: () => chain,
      is: () => chain,
      order: () => chain,
      gte: () => chain,
      lte: () => chain,
      eq: () => chain,
      then: (cb: (v: unknown) => unknown) => cb({ data: rows, error: null }),
    };
    mockFromBuilder.mockReturnValue(chain);

    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('purchase_id,purchase_date,holding_name,set_name,product_type,kind,qty,cost_cents,source,location,condition,is_graded,grading_company,grade,cert_number,source_rip_id,source_decomposition_id,notes,created_at');
    // data row checks
    expect(lines[1]).toContain('42');
    expect(lines[1]).toContain('2026-04-01');
    expect(lines[1]).toContain('Scarlet & Violet 151 ETB');
    expect(lines[1]).toContain('5999');
    // notes with comma should be quoted
    expect(lines[1]).toContain('"first buy, special"');
  });
});
