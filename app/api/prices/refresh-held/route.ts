import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { snapshotForItems } from '@/lib/services/price-snapshots';

export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const { data: decompositions, error: dErr } = await supabase
    .from('box_decompositions')
    .select('id, source_purchase_id');
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as RawSaleRow[]
  );

  const heldIds = holdings.filter((h) => h.qtyHeld > 0).map((h) => h.catalogItemId);

  if (heldIds.length === 0) {
    return NextResponse.json({
      itemsRefreshed: 0,
      rowsWritten: 0,
      itemsSkippedManual: 0,
      durationMs: Date.now() - startedAt,
      refreshedAt: new Date().toISOString(),
    });
  }

  const result = await snapshotForItems(heldIds);

  return NextResponse.json({
    itemsRefreshed: result.itemsUpdated,
    rowsWritten: result.rowsWritten,
    itemsSkippedManual: result.itemsSkippedManual,
    durationMs: Date.now() - startedAt,
    refreshedAt: new Date().toISOString(),
  });
}
