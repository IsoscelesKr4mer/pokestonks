// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

type Purchase = {
  id: number;
  catalog_item_id: number;
  quantity: number;
  cost_cents: number;
  deleted_at: string | null;
  created_at: string;
  catalog_item: {
    kind: 'sealed' | 'card';
    name: string;
    set_name: string | null;
    product_type: string | null;
    image_url: string | null;
    image_storage_path: string | null;
    last_market_cents: number | null;
    last_market_at: string | null;
  };
};

function buildSupabase(opts: {
  authedUserId?: string | null;
  purchases?: Purchase[];
  rips?: Array<{ id: number; source_purchase_id: number; realized_loss_cents: number }>;
  decompositions?: Array<{ id: number; source_purchase_id: number }>;
  sales?: Array<{ id: number; purchase_id: number; quantity: number; sale_price_cents: number; fees_cents: number; matched_cost_cents: number }>;
}) {
  const fromMap: Record<string, unknown> = {
    purchases: {
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data: opts.purchases ?? [], error: null }),
      }),
    },
    rips: {
      select: vi.fn().mockResolvedValue({ data: opts.rips ?? [], error: null }),
    },
    box_decompositions: {
      select: vi.fn().mockResolvedValue({ data: opts.decompositions ?? [], error: null }),
    },
    sales: {
      select: vi.fn().mockResolvedValue({ data: opts.sales ?? [], error: null }),
    },
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.authedUserId == null ? null : { id: opts.authedUserId } },
      }),
    },
    from: vi.fn((table: string) => fromMap[table]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/exports/portfolio-summary', () => {
  it('401 without auth', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: null })
    );
    const res = await GET();
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe('unauthorized');
  });

  it('returns CSV with header row, totals row, and one holding row', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 10,
        quantity: 2,
        cost_cents: 4999,
        deleted_at: null,
        created_at: '2026-04-01T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'Scarlet & Violet 151 ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-27T00:00:00Z',
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [], sales: [] })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const text = await res.text();
    const lines = text.split('\r\n').filter(Boolean);

    // Header
    expect(lines[0]).toBe('catalog_item_id,name,set_name,product_type,kind,qty_held,total_invested_cents,last_market_cents,last_market_at,current_value_cents,pnl_cents,pnl_pct,priced,stale');

    // Totals row (catalog_item_id blank, name = PORTFOLIO TOTALS)
    expect(lines[1]).toContain('PORTFOLIO TOTALS');
    expect(lines[1]).toContain('9998'); // totalInvestedCents = 2 * 4999

    // Holding row
    expect(lines[2]).toContain('10');
    expect(lines[2]).toContain('Scarlet & Violet 151 ETB');
    expect(lines[2]).toContain('SV151');
    expect(lines[2]).toContain('12000'); // currentValueCents = 2 * 6000
  });
});
