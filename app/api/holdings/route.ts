import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computeHoldingPnL } from '@/lib/services/pnl';
import { db, schema } from '@/lib/db/client';
import { and, desc, inArray, lte } from 'drizzle-orm';
import { computeDeltas } from '@/lib/services/price-deltas';

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
      'id, catalog_item_id, quantity, cost_cents, unknown_cost, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
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

  const { data: decompositions, error: dErr } = await supabase
    .from('box_decompositions')
    .select('id, source_purchase_id');
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity');
  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as RawSaleRow[]
  );

  const now = new Date();
  const holdingsPnL = holdings.map((h) => computeHoldingPnL(h, now));

  const catalogItemIds = holdingsPnL.map((h) => h.catalogItemId);

  let deltaMap = new Map<number, { deltaCents: number | null; deltaPct: number | null }>();
  let manualMap = new Map<number, number | null>();

  if (catalogItemIds.length > 0) {
    // Fetch manual_market_cents per held item
    const manuals = await db.query.catalogItems.findMany({
      where: inArray(schema.catalogItems.id, catalogItemIds),
      columns: { id: true, manualMarketCents: true },
    });
    for (const m of manuals) {
      manualMap.set(m.id, m.manualMarketCents ?? null);
    }

    // Find each item's market price at or before 7 days ago (latest qualifying row)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Fetch all rows at or before sevenDaysAgo for held items, then keep the latest per item.
    // Holdings are typically < 50 items so this is fine without a subquery.
    const allThenRows = await db.query.marketPrices.findMany({
      where: and(
        inArray(schema.marketPrices.catalogItemId, catalogItemIds),
        lte(schema.marketPrices.snapshotDate, sevenDaysAgo)
      ),
      columns: { catalogItemId: true, snapshotDate: true, marketPriceCents: true },
      orderBy: [desc(schema.marketPrices.snapshotDate)],
    });

    // Pick the first (latest) row per catalogItemId
    const thenMap = new Map<number, number | null>();
    for (const row of allThenRows) {
      if (!thenMap.has(row.catalogItemId)) {
        thenMap.set(row.catalogItemId, row.marketPriceCents);
      }
    }

    const deltaInputs = holdingsPnL.map((h) => {
      const manualCents = manualMap.get(h.catalogItemId);
      const nowCents = manualCents ?? h.lastMarketCents ?? null;
      return {
        catalogItemId: h.catalogItemId,
        nowCents,
        thenCents: thenMap.get(h.catalogItemId) ?? null,
      };
    });

    deltaMap = computeDeltas(deltaInputs);
  }

  const enriched = holdingsPnL.map((h) => {
    const delta = deltaMap.get(h.catalogItemId) ?? { deltaCents: null, deltaPct: null };
    return {
      ...h,
      delta7dCents: delta.deltaCents,
      delta7dPct: delta.deltaPct,
      manualMarketCents: manualMap.get(h.catalogItemId) ?? null,
    };
  });

  return NextResponse.json({ holdings: enriched });
}
