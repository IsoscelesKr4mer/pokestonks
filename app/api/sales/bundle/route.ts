import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { bundleSaleCreateSchema } from '@/lib/validation/sale';
import {
  matchFifo,
  loadOpenLotsByCatalogItem,
  type OpenLot,
} from '@/lib/services/sales';
import { randomUUID } from 'crypto';

/**
 * Create a bundle sale: one sale_group_id spans multiple catalog items.
 * Each item is FIFO-matched across its own lots; per-item revenue/fees
 * come pre-allocated from the caller (computed proportional to market
 * value or set manually in the UI).
 */
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

  // Reject duplicate catalog_items in the bundle — the UX picker should
  // prevent this but enforce server-side too.
  const seen = new Set<number>();
  for (const it of v.items) {
    if (seen.has(it.catalogItemId)) {
      return NextResponse.json(
        { error: 'duplicate_item_in_bundle', catalogItemId: it.catalogItemId },
        { status: 422 }
      );
    }
    seen.add(it.catalogItemId);
  }

  const catalogItemIds = v.items.map((i) => i.catalogItemId);
  const loaded = await loadOpenLotsByCatalogItem(supabase, catalogItemIds);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  // Match FIFO per item, accumulate sale rows.
  const allRows: Array<{
    catalogItemId: number;
    purchaseId: number;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
  }> = [];
  let totalSalePriceCents = 0;
  let totalFeesCents = 0;
  let totalMatchedCostCents = 0;

  for (const item of v.items) {
    const lots: OpenLot[] = (loaded.lotsByCatalog.get(item.catalogItemId) ?? []).map(
      (l) => ({
        purchaseId: l.purchaseId,
        purchaseDate: l.purchaseDate,
        createdAt: l.createdAt,
        costCents: l.costCents,
        qtyAvailable: l.qtyAvailable,
      })
    );
    const matched = matchFifo(lots, {
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
    for (const r of matched.rows) {
      allRows.push({
        catalogItemId: item.catalogItemId,
        purchaseId: r.purchaseId,
        quantity: r.quantity,
        salePriceCents: r.salePriceCents,
        feesCents: r.feesCents,
        matchedCostCents: r.matchedCostCents,
      });
    }
    totalSalePriceCents += item.salePriceCents;
    totalFeesCents += item.feesCents;
    totalMatchedCostCents += matched.totalMatchedCostCents;
  }

  const saleGroupId = randomUUID();

  try {
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.sales)
        .values(
          allRows.map((r) => ({
            userId: user.id,
            saleGroupId,
            purchaseId: r.purchaseId,
            saleDate: v.saleDate,
            quantity: r.quantity,
            salePriceCents: r.salePriceCents,
            feesCents: r.feesCents,
            matchedCostCents: r.matchedCostCents,
            platform: v.platform ?? null,
            notes: v.notes ?? null,
          }))
        )
        .returning();
      return rows;
    });

    return NextResponse.json(
      {
        saleGroupId,
        saleIds: inserted.map((r) => r.id),
        totals: {
          totalSalePriceCents,
          totalFeesCents,
          totalMatchedCostCents,
          realizedPnLCents:
            totalSalePriceCents - totalFeesCents - totalMatchedCostCents,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'bundle sale create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
