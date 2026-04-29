import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saleCreateSchema } from '@/lib/validation/sale';
import { matchFifo, type OpenLot } from '@/lib/services/sales';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = saleCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Load open lots for this catalog item, scoped to user via RLS.
  const { data: lots, error: lotsErr } = await supabase
    .from('purchases')
    .select('id, quantity, cost_cents, purchase_date, created_at, source')
    .eq('catalog_item_id', v.catalogItemId)
    .is('deleted_at', null);
  if (lotsErr) {
    return NextResponse.json({ error: lotsErr.message }, { status: 500 });
  }
  const lotIds = (lots ?? []).map((l) => l.id);

  // Consumed by rips, decompositions, prior sales.
  let ripCounts = new Map<number, number>();
  let decompCounts = new Map<number, number>();
  let saleCounts = new Map<number, number>();
  if (lotIds.length > 0) {
    const { data: rips, error: rErr } = await supabase
      .from('rips')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    for (const r of rips ?? []) {
      ripCounts.set(r.source_purchase_id, (ripCounts.get(r.source_purchase_id) ?? 0) + 1);
    }

    const { data: decomps, error: dErr } = await supabase
      .from('box_decompositions')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    for (const d of decomps ?? []) {
      decompCounts.set(d.source_purchase_id, (decompCounts.get(d.source_purchase_id) ?? 0) + 1);
    }

    const { data: priorSales, error: sErr } = await supabase
      .from('sales')
      .select('purchase_id, quantity')
      .in('purchase_id', lotIds);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    for (const s of priorSales ?? []) {
      saleCounts.set(s.purchase_id, (saleCounts.get(s.purchase_id) ?? 0) + s.quantity);
    }
  }

  const openLots: OpenLot[] = (lots ?? []).map((l) => ({
    purchaseId: l.id,
    purchaseDate: l.purchase_date,
    createdAt: l.created_at,
    costCents: l.cost_cents,
    qtyAvailable:
      l.quantity -
      (ripCounts.get(l.id) ?? 0) -
      (decompCounts.get(l.id) ?? 0) -
      (saleCounts.get(l.id) ?? 0),
  }));

  const result = matchFifo(openLots, {
    totalQty: v.totalQty,
    totalSalePriceCents: v.totalSalePriceCents,
    totalFeesCents: v.totalFeesCents,
    saleDate: v.saleDate,
    platform: v.platform ?? null,
    notes: v.notes ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, totalAvailable: result.totalAvailable },
      { status: 422 }
    );
  }

  // Map back with display metadata for the dialog table.
  const lotById = new Map((lots ?? []).map((l) => [l.id, l]));
  const rows = result.rows.map((r) => {
    const l = lotById.get(r.purchaseId)!;
    return {
      purchaseId: r.purchaseId,
      purchaseDate: l.purchase_date,
      purchaseSource: l.source,
      perUnitCostCents: l.cost_cents,
      quantity: r.quantity,
      salePriceCents: r.salePriceCents,
      feesCents: r.feesCents,
      matchedCostCents: r.matchedCostCents,
      realizedPnLCents: r.salePriceCents - r.feesCents - r.matchedCostCents,
    };
  });

  const qtyAvailable = openLots.reduce((s, l) => s + Math.max(0, l.qtyAvailable), 0);

  return NextResponse.json({
    ok: true,
    rows,
    totals: {
      totalSalePriceCents: v.totalSalePriceCents,
      totalFeesCents: v.totalFeesCents,
      totalMatchedCostCents: result.totalMatchedCostCents,
      realizedPnLCents: result.realizedPnLCents,
      qtyAvailable,
    },
  });
}
