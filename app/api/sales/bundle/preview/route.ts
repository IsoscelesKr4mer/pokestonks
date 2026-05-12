import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bundleSaleCreateSchema } from '@/lib/validation/sale';
import {
  matchFifo,
  loadOpenLotsByCatalogItem,
  type OpenLot,
} from '@/lib/services/sales';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bundleSaleCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const catalogItemIds = v.items.map((i) => i.catalogItemId);
  const loaded = await loadOpenLotsByCatalogItem(supabase, catalogItemIds);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  // For preview display, also pull catalog item names + last_market_cents so the
  // dialog can show item-level totals and market-share allocation hints.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: ciRaw } = await sb
    .from('catalog_items')
    .select('id, name, set_name, image_url, last_market_cents')
    .in('id', catalogItemIds);
  const ci = new Map<number, {
    id: number;
    name: string;
    set_name: string | null;
    image_url: string | null;
    last_market_cents: number | null;
  }>((ciRaw ?? []).map((c: {
    id: number;
    name: string;
    set_name: string | null;
    image_url: string | null;
    last_market_cents: number | null;
  }) => [c.id, c]));

  const items = [];
  let bundleSalePriceCents = 0;
  let bundleFeesCents = 0;
  let bundleMatchedCostCents = 0;

  for (const item of v.items) {
    const lotsWithSource = loaded.lotsByCatalog.get(item.catalogItemId) ?? [];
    const openLots: OpenLot[] = lotsWithSource.map((l) => ({
      purchaseId: l.purchaseId,
      purchaseDate: l.purchaseDate,
      createdAt: l.createdAt,
      costCents: l.costCents,
      qtyAvailable: l.qtyAvailable,
    }));
    const matched = matchFifo(openLots, {
      totalQty: item.totalQty,
      totalSalePriceCents: item.salePriceCents,
      totalFeesCents: item.feesCents,
      saleDate: v.saleDate,
      platform: v.platform ?? null,
      notes: v.notes ?? null,
    });
    if (!matched.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: matched.reason,
          catalogItemId: item.catalogItemId,
          totalAvailable: matched.totalAvailable,
        },
        { status: 422 }
      );
    }
    const lotById = new Map(lotsWithSource.map((l) => [l.purchaseId, l]));
    const rows = matched.rows.map((r) => {
      const lot = lotById.get(r.purchaseId)!;
      return {
        purchaseId: r.purchaseId,
        purchaseDate: lot.purchaseDate,
        purchaseSource: lot.source,
        perUnitCostCents: lot.costCents,
        quantity: r.quantity,
        salePriceCents: r.salePriceCents,
        feesCents: r.feesCents,
        matchedCostCents: r.matchedCostCents,
        realizedPnLCents: r.salePriceCents - r.feesCents - r.matchedCostCents,
      };
    });
    const qtyAvailable = openLots.reduce((s, l) => s + Math.max(0, l.qtyAvailable), 0);
    const catalogItem = ci.get(item.catalogItemId) ?? null;
    items.push({
      catalogItemId: item.catalogItemId,
      catalogItem: catalogItem
        ? {
            id: catalogItem.id,
            name: catalogItem.name,
            setName: catalogItem.set_name,
            imageUrl: catalogItem.image_url,
            lastMarketCents: catalogItem.last_market_cents,
          }
        : null,
      rows,
      totals: {
        totalQty: item.totalQty,
        totalSalePriceCents: item.salePriceCents,
        totalFeesCents: item.feesCents,
        totalMatchedCostCents: matched.totalMatchedCostCents,
        realizedPnLCents: matched.realizedPnLCents,
        qtyAvailable,
      },
    });
    bundleSalePriceCents += item.salePriceCents;
    bundleFeesCents += item.feesCents;
    bundleMatchedCostCents += matched.totalMatchedCostCents;
  }

  return NextResponse.json({
    ok: true,
    items,
    bundleTotals: {
      totalSalePriceCents: bundleSalePriceCents,
      totalFeesCents: bundleFeesCents,
      totalMatchedCostCents: bundleMatchedCostCents,
      realizedPnLCents:
        bundleSalePriceCents - bundleFeesCents - bundleMatchedCostCents,
    },
  });
}
