import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computePortfolioPnL } from '@/lib/services/pnl';

const HEADERS = [
  'catalog_item_id', 'name', 'set_name', 'product_type', 'kind',
  'qty_held', 'total_invested_cents', 'last_market_cents', 'last_market_at',
  'current_value_cents', 'pnl_cents', 'pnl_pct',
  'priced', 'stale',
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const { data: purchases } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);
  const { data: rips } = await supabase.from('rips').select('id, source_purchase_id, realized_loss_cents');
  const { data: decompositions } = await supabase.from('box_decompositions').select('id, source_purchase_id');
  const { data: sales } = await supabase.from('sales').select('id, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents');

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as unknown as RawSaleRow[]
  );

  const realizedRipLossCents = (rips ?? []).reduce((s, r) => s + ((r as { realized_loss_cents: number }).realized_loss_cents ?? 0), 0);
  const realizedSalesPnLCents = (sales ?? []).reduce((s, r) => s + (r.sale_price_cents - r.fees_cents - r.matched_cost_cents), 0);
  const result = computePortfolioPnL(holdings, realizedRipLossCents, realizedSalesPnLCents, (purchases ?? []).length);

  let body = csvRow(HEADERS);

  // Totals row first.
  body += csvRow([
    '',
    'PORTFOLIO TOTALS',
    '', '', '',
    '',
    result.totalInvestedCents,
    '',
    '',
    result.totalCurrentValueCents,
    result.unrealizedPnLCents,
    result.unrealizedPnLPct?.toFixed(2) ?? '',
    '',
    '',
  ]);

  for (const h of result.perHolding) {
    body += csvRow([
      h.catalogItemId, h.name, h.setName, h.productType, h.kind,
      h.qtyHeld, h.totalInvestedCents, h.lastMarketCents, h.lastMarketAt,
      h.currentValueCents, h.pnlCents, h.pnlPct?.toFixed(2) ?? '',
      h.priced, h.stale,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-portfolio-${today}.csv"`,
    },
  });
}
