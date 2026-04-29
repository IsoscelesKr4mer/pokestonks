import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';

const HEADERS = [
  'purchase_id', 'purchase_date',
  'holding_name', 'set_name', 'product_type', 'kind',
  'qty', 'cost_cents',
  'source', 'location', 'condition',
  'is_graded', 'grading_company', 'grade', 'cert_number',
  'source_rip_id', 'source_decomposition_id',
  'notes', 'created_at',
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
  const kind = url.searchParams.get('kind');

  let query = supabase
    .from('purchases')
    .select(
      'id, purchase_date, quantity, cost_cents, source, location, condition, is_graded, grading_company, grade, cert_number, source_rip_id, source_decomposition_id, notes, created_at, ' +
        'catalog_item:catalog_items!inner(name, set_name, product_type, kind)'
    )
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
    .order('id', { ascending: true });

  if (start) query = query.gte('purchase_date', start);
  if (end) query = query.lte('purchase_date', end);
  if (kind) query = query.eq('catalog_item.kind', kind);

  type PurchaseRow = {
    id: number;
    purchase_date: string;
    quantity: number;
    cost_cents: number;
    source: string | null;
    location: string | null;
    condition: string | null;
    is_graded: boolean | null;
    grading_company: string | null;
    grade: string | null;
    cert_number: string | null;
    source_rip_id: number | null;
    source_decomposition_id: number | null;
    notes: string | null;
    created_at: string;
    catalog_item: {
      name: string;
      set_name: string | null;
      product_type: string | null;
      kind: 'sealed' | 'card';
    };
  };

  const { data, error } = (await query) as {
    data: PurchaseRow[] | null;
    error: { message: string } | null;
  };
  if (error) return new Response(error.message, { status: 500 });

  let body = csvRow(HEADERS);
  for (const r of data ?? []) {
    const c = r.catalog_item;
    body += csvRow([
      r.id, r.purchase_date,
      c.name, c.set_name, c.product_type, c.kind,
      r.quantity, r.cost_cents,
      r.source, r.location, r.condition,
      r.is_graded, r.grading_company, r.grade, r.cert_number,
      r.source_rip_id, r.source_decomposition_id,
      r.notes, r.created_at,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-purchases-${today}.csv"`,
    },
  });
}
