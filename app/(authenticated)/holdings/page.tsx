import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HoldingsGrid } from './HoldingsGrid';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow } from '@/lib/services/holdings';
import { computeHoldingPnL } from '@/lib/services/pnl';

export default async function HoldingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: purchases } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);

  const { data: rips } = await supabase.from('rips').select('id, source_purchase_id');

  const { data: decompositions } = await supabase
    .from('box_decompositions')
    .select('id, source_purchase_id');

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[]
  );
  const now = new Date();
  const holdingsPnL = holdings.map((h) => computeHoldingPnL(h, now));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Holdings</h1>
      <HoldingsGrid initialHoldings={holdingsPnL} />
    </div>
  );
}
