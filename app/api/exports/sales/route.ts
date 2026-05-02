import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';

const HEADERS = [
  'sale_group_id', 'sale_id', 'sale_date',
  'holding_name', 'set_name', 'product_type', 'kind',
  'purchase_id', 'purchase_date', 'qty', 'per_unit_cost_cents',
  'sale_price_cents', 'fees_cents', 'matched_cost_cents', 'realized_pnl_cents',
  'platform', 'notes',
] as const;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');

  let query = supabase
    .from('sales')
    .select(
      'id, sale_group_id, sale_date, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, ' +
        'purchase:purchases!inner(purchase_date, cost_cents, unknown_cost, catalog_item:catalog_items!inner(name, set_name, product_type, kind))'
    )
    .order('sale_date', { ascending: false })
    .order('sale_group_id', { ascending: true })
    .order('id', { ascending: true });

  if (start) query = query.gte('sale_date', start);
  if (end) query = query.lte('sale_date', end);
  if (platform) query = query.eq('platform', platform);
  if (q) query = query.ilike('purchase.catalog_item.name', `%${q}%`);

  type SaleRow = {
    id: number;
    sale_group_id: string;
    sale_date: string;
    purchase_id: number;
    quantity: number;
    sale_price_cents: number;
    fees_cents: number;
    matched_cost_cents: number;
    platform: string | null;
    notes: string | null;
    purchase: {
      purchase_date: string;
      cost_cents: number;
      unknown_cost: boolean;
      catalog_item: {
        name: string;
        set_name: string | null;
        product_type: string | null;
        kind: 'sealed' | 'card';
      };
    };
  };

  const { data, error } = (await query) as {
    data: SaleRow[] | null;
    error: { message: string } | null;
  };
  if (error) return new Response(error.message, { status: 500 });

  let body = csvRow(HEADERS);
  for (const r of data ?? []) {
    const p = r.purchase;
    const realized = r.sale_price_cents - r.fees_cents - r.matched_cost_cents;
    body += csvRow([
      r.sale_group_id, r.id, r.sale_date,
      p.catalog_item.name, p.catalog_item.set_name, p.catalog_item.product_type, p.catalog_item.kind,
      r.purchase_id, p.purchase_date, r.quantity, p.cost_cents,
      r.sale_price_cents, r.fees_cents, r.matched_cost_cents, realized,
      r.platform, r.notes,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-sales-${today}.csv"`,
    },
  });
}
