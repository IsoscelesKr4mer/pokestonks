import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { saleCreateSchema } from '@/lib/validation/sale';
import { matchFifo, type OpenLot } from '@/lib/services/sales';
import { randomUUID } from 'crypto';

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

  // Load open lots inside the read-modify-write critical section.
  // Single-user app, so no contention; structure mirrors decompositions POST.
  const { data: lots, error: lotsErr } = await supabase
    .from('purchases')
    .select('id, quantity, cost_cents, purchase_date, created_at')
    .eq('catalog_item_id', v.catalogItemId)
    .is('deleted_at', null);
  if (lotsErr) return NextResponse.json({ error: lotsErr.message }, { status: 500 });
  const lotIds = (lots ?? []).map((l) => l.id);

  let ripCounts = new Map<number, number>();
  let decompCounts = new Map<number, number>();
  let saleCounts = new Map<number, number>();
  if (lotIds.length > 0) {
    const { data: rips } = await supabase.from('rips').select('source_purchase_id').in('source_purchase_id', lotIds);
    for (const r of rips ?? []) ripCounts.set(r.source_purchase_id, (ripCounts.get(r.source_purchase_id) ?? 0) + 1);

    const { data: decomps } = await supabase.from('box_decompositions').select('source_purchase_id').in('source_purchase_id', lotIds);
    for (const d of decomps ?? []) decompCounts.set(d.source_purchase_id, (decompCounts.get(d.source_purchase_id) ?? 0) + 1);

    const { data: priorSales } = await supabase.from('sales').select('purchase_id, quantity').in('purchase_id', lotIds);
    for (const s of priorSales ?? []) saleCounts.set(s.purchase_id, (saleCounts.get(s.purchase_id) ?? 0) + s.quantity);
  }

  const openLots: OpenLot[] = (lots ?? []).map((l) => ({
    purchaseId: l.id,
    purchaseDate: l.purchase_date,
    createdAt: l.created_at,
    costCents: l.cost_cents,
    qtyAvailable: l.quantity - (ripCounts.get(l.id) ?? 0) - (decompCounts.get(l.id) ?? 0) - (saleCounts.get(l.id) ?? 0),
  }));

  const matched = matchFifo(openLots, {
    totalQty: v.totalQty,
    totalSalePriceCents: v.totalSalePriceCents,
    totalFeesCents: v.totalFeesCents,
    saleDate: v.saleDate,
    platform: v.platform ?? null,
    notes: v.notes ?? null,
  });
  if (!matched.ok) {
    return NextResponse.json(
      { ok: false, reason: matched.reason, totalAvailable: matched.totalAvailable },
      { status: 422 }
    );
  }

  const saleGroupId = randomUUID();

  try {
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.sales)
        .values(
          matched.rows.map((r) => ({
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
          totalSalePriceCents: v.totalSalePriceCents,
          totalFeesCents: v.totalFeesCents,
          totalMatchedCostCents: matched.totalMatchedCostCents,
          realizedPnLCents: matched.realizedPnLCents,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sale create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  let query = supabase
    .from('sales')
    .select(
      'id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, created_at, ' +
        'purchase:purchases!inner(id, purchase_date, cost_cents, unknown_cost, catalog_item:catalog_items!inner(id, name, set_name, product_type, kind, image_url, image_storage_path))'
    )
    .order('sale_date', { ascending: false })
    .order('sale_group_id', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (start) query = query.gte('sale_date', start);
  if (end) query = query.lte('sale_date', end);
  if (platform) query = query.eq('platform', platform);
  if (q) query = query.ilike('purchase.catalog_item.name', `%${q}%`);

  // TODO: drop cast after Supabase types regen post-migration-0008.
  const { data: rawData, error } = (await query) as {
    data: SaleRow[] | null;
    error: { message: string } | null;
  };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type SaleRow = {
    id: number;
    sale_group_id: string;
    purchase_id: number;
    sale_date: string;
    quantity: number;
    sale_price_cents: number;
    fees_cents: number;
    matched_cost_cents: number;
    platform: string | null;
    notes: string | null;
    created_at: string;
    purchase: {
      id: number;
      purchase_date: string;
      cost_cents: number;
      unknown_cost: boolean;
      catalog_item: {
        id: number;
        name: string;
        set_name: string | null;
        product_type: string | null;
        kind: 'sealed' | 'card';
        image_url: string | null;
        image_storage_path: string | null;
      };
    };
  };
  const data: SaleRow[] = (rawData as SaleRow[]) ?? [];

  // Group by sale_group_id, preserving date order from the query.
  const groups = new Map<string, SaleRow[]>();
  for (const r of data) {
    const arr = groups.get(r.sale_group_id) ?? [];
    arr.push(r);
    groups.set(r.sale_group_id, arr);
  }

  const sales = Array.from(groups.entries()).map(([saleGroupId, rows]) => {
    const first = rows[0];
    const purchase = first.purchase;
    const totals = rows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        salePriceCents: acc.salePriceCents + r.sale_price_cents,
        feesCents: acc.feesCents + r.fees_cents,
        matchedCostCents: acc.matchedCostCents + r.matched_cost_cents,
      }),
      { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
    );
    return {
      saleGroupId,
      saleDate: first.sale_date,
      platform: first.platform,
      notes: first.notes,
      unknownCost: rows.some((r) => r.purchase.unknown_cost),
      catalogItem: {
        id: purchase.catalog_item.id,
        name: purchase.catalog_item.name,
        setName: purchase.catalog_item.set_name,
        productType: purchase.catalog_item.product_type,
        kind: purchase.catalog_item.kind,
        imageUrl: purchase.catalog_item.image_url,
        imageStoragePath: purchase.catalog_item.image_storage_path,
      },
      totals: {
        ...totals,
        realizedPnLCents: totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
      },
      rows: rows.map((r) => {
        const p = r.purchase;
        return {
          saleId: r.id,
          purchaseId: p.id,
          purchaseDate: p.purchase_date,
          perUnitCostCents: p.cost_cents,
          unknownCost: p.unknown_cost,
          quantity: r.quantity,
          salePriceCents: r.sale_price_cents,
          feesCents: r.fees_cents,
          matchedCostCents: r.matched_cost_cents,
        };
      }),
      createdAt: first.created_at,
    };
  });

  const nextOffset = data.length === limit ? offset + limit : null;
  return NextResponse.json({ sales, nextOffset });
}
