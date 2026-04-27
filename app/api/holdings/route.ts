import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents)'
    )
    .is('deleted_at', null);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[]
  );

  return NextResponse.json({ holdings });
}
