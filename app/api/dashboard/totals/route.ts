import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computePortfolioPnL, type HoldingPnL } from '@/lib/services/pnl';
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
  // Count OPEN lots only (matches holdings page). Mirrors the consumption
  // logic in aggregateHoldings — a purchase row whose units have all been
  // ripped, decomposed, or sold is no longer a "lot you currently hold."
  const consumedByPurchase = new Map<number, number>();
  for (const r of (rips ?? []) as RawRipRow[]) {
    consumedByPurchase.set(
      r.source_purchase_id,
      (consumedByPurchase.get(r.source_purchase_id) ?? 0) + 1
    );
  }
  for (const d of (decompositions ?? []) as RawDecompositionRow[]) {
    consumedByPurchase.set(
      d.source_purchase_id,
      (consumedByPurchase.get(d.source_purchase_id) ?? 0) + 1
    );
  }
  for (const s of (sales ?? []) as Array<{ purchase_id: number; quantity: number }>) {
    consumedByPurchase.set(
      s.purchase_id,
      (consumedByPurchase.get(s.purchase_id) ?? 0) + s.quantity
    );
  }
  const lotCount = (purchases ?? []).filter((p) => {
    const consumed = consumedByPurchase.get((p as { id: number }).id) ?? 0;
    return ((p as { quantity: number }).quantity ?? 0) - consumed > 0;
  }).length;
  const saleEventCount = new Set((sales ?? []).map((s) => s.sale_group_id)).size;

  const result = computePortfolioPnL(
    holdings,
    realizedRipLossCents,
    realizedSalesPnLCents,
    lotCount
  );

  // --- Delta + manual enrichment ---
  const heldIds = result.perHolding.map((h) => h.catalogItemId);

  let deltaMap = new Map<number, { deltaCents: number | null; deltaPct: number | null }>();
  let manualMap = new Map<number, number | null>();
  let portfolioDelta7dCents: number | null = null;
  let portfolioDelta7dPct: number | null = null;
  let deltaCoverage = { covered: 0, total: heldIds.length };

  if (heldIds.length > 0) {
    // Manual overrides.
    const manuals = await db.query.catalogItems.findMany({
      where: inArray(schema.catalogItems.id, heldIds),
      columns: { id: true, manualMarketCents: true },
    });
    for (const m of manuals) {
      manualMap.set(m.id, m.manualMarketCents ?? null);
    }

    // "Then" prices: latest row per item at or before 7 days ago.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const allThenRows = await db.query.marketPrices.findMany({
      where: and(
        inArray(schema.marketPrices.catalogItemId, heldIds),
        lte(schema.marketPrices.snapshotDate, sevenDaysAgo)
      ),
      columns: { catalogItemId: true, snapshotDate: true, marketPriceCents: true },
      orderBy: [desc(schema.marketPrices.snapshotDate)],
    });
    const thenMap = new Map<number, number | null>();
    for (const row of allThenRows) {
      if (!thenMap.has(row.catalogItemId)) {
        thenMap.set(row.catalogItemId, row.marketPriceCents);
      }
    }

    // Per-item delta inputs.
    const deltaInputs = result.perHolding.map((h) => {
      const manual = manualMap.get(h.catalogItemId) ?? null;
      const nowCents = manual ?? h.lastMarketCents ?? null;
      return {
        catalogItemId: h.catalogItemId,
        nowCents,
        thenCents: thenMap.get(h.catalogItemId) ?? null,
      };
    });
    deltaMap = computeDeltas(deltaInputs);

    // Portfolio-level delta: sum across items that have both nowCents + thenCents.
    let nowTotal = 0;
    let thenTotal = 0;
    let covered = 0;
    for (const h of result.perHolding) {
      const manual = manualMap.get(h.catalogItemId) ?? null;
      const nowCents = manual ?? h.lastMarketCents ?? null;
      const thenCents = thenMap.get(h.catalogItemId) ?? null;
      if (nowCents != null && thenCents != null) {
        nowTotal += nowCents * h.qtyHeld;
        thenTotal += thenCents * h.qtyHeld;
        covered++;
      }
    }
    deltaCoverage = { covered, total: heldIds.length };
    if (covered > 0) {
      portfolioDelta7dCents = nowTotal - thenTotal;
      portfolioDelta7dPct =
        thenTotal > 0
          ? Math.round(((portfolioDelta7dCents / thenTotal) * 100) * 100) / 100
          : null;
    }
  }

  // Enrich a HoldingPnL row with per-item delta + manual fields.
  function enrichHolding(h: HoldingPnL) {
    const d = deltaMap.get(h.catalogItemId) ?? { deltaCents: null, deltaPct: null };
    return {
      ...h,
      delta7dCents: d.deltaCents,
      delta7dPct: d.deltaPct,
      manualMarketCents: manualMap.get(h.catalogItemId) ?? null,
    };
  }

  const enrichedResult = {
    ...result,
    bestPerformers: result.bestPerformers.map(enrichHolding),
    worstPerformers: result.worstPerformers.map(enrichHolding),
    portfolioDelta7dCents,
    portfolioDelta7dPct,
    deltaCoverage,
  };

  return NextResponse.json({ ...enrichedResult, saleEventCount });
}
