import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computePortfolioPnL } from '@/lib/services/pnl';

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
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id, realized_loss_cents');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const { data: decompositions, error: dErr } = await supabase
    .from('box_decompositions')
    .select('id, source_purchase_id');
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents, sale_group_id');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as unknown as RawSaleRow[]
  );

  const realizedRipLossCents = (rips ?? []).reduce(
    (acc, r) => acc + ((r as { realized_loss_cents: number }).realized_loss_cents ?? 0),
    0
  );
  const realizedSalesPnLCents = (sales ?? []).reduce(
    (acc, s) => acc + (s.sale_price_cents - s.fees_cents - s.matched_cost_cents),
    0
  );
  const lotCount = (purchases ?? []).length;
  const saleEventCount = new Set((sales ?? []).map((s) => s.sale_group_id)).size;

  const result = computePortfolioPnL(
    holdings,
    realizedRipLossCents,
    realizedSalesPnLCents,
    lotCount
  );
  return NextResponse.json({ ...result, saleEventCount });
}
