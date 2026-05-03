import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HoldingsGrid } from './HoldingsGrid';
import { HoldingsHeaderCaption } from './HoldingsHeaderCaption';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow, type RawSaleRow } from '@/lib/services/holdings';
import { computeHoldingPnL } from '@/lib/services/pnl';
import { RefreshHeldButton } from '@/components/prices/RefreshHeldButton';

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

  const { data: sales } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity');

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as RawSaleRow[]
  );
  const now = new Date();
  const holdingsPnL = holdings.map((h) => computeHoldingPnL(h, now));

  const totals = {
    lotCount: holdingsPnL.length,
    pricedCount: holdingsPnL.filter((h) => h.priced).length,
    unpricedCount: holdingsPnL.filter((h) => !h.priced).length,
    totalInvestedCents: holdingsPnL.reduce((sum, h) => sum + h.totalInvestedCents, 0),
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10">
      <div className="flex items-end justify-between gap-4 pb-[18px] border-b border-divider">
        <div className="grid gap-1">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none">Holdings</h1>
          <HoldingsHeaderCaption
            lotCount={totals.lotCount}
            pricedCount={totals.pricedCount}
            unpricedCount={totals.unpricedCount}
            totalInvestedCents={totals.totalInvestedCents}
          />
        </div>
        <RefreshHeldButton />
      </div>
      <div className="mt-6">
        <HoldingsGrid initialHoldings={holdingsPnL} />
      </div>
    </div>
  );
}
