import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { buildSaleEvent } from '@/lib/api/saleEvent';
import { saleUpdateSchema } from '@/lib/validation/sale';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { saleGroupId } = await ctx.params;

  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

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

  // TODO: drop cast after Supabase types regen post-migration-0008.
  const { data, error } = (await supabase
    .from('sales')
    .select(
      'id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, created_at, ' +
        'purchase:purchases!inner(id, purchase_date, cost_cents, unknown_cost, catalog_item:catalog_items!inner(id, name, set_name, product_type, kind, image_url, image_storage_path))'
    )
    .eq('sale_group_id', saleGroupId)
    .order('id', { ascending: true })) as { data: SaleRow[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }

  return NextResponse.json(buildSaleEvent(saleGroupId, data));
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { saleGroupId } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Load the existing sale rows for the group. We need:
  //   - to confirm the group exists and is owned by the user
  //   - per-row quantities to redistribute per-item allocations
  const existing = await db
    .select({
      id: schema.sales.id,
      purchaseId: schema.sales.purchaseId,
      quantity: schema.sales.quantity,
      catalogItemId: schema.purchases.catalogItemId,
    })
    .from(schema.sales)
    .innerJoin(schema.purchases, eq(schema.purchases.id, schema.sales.purchaseId))
    .where(
      and(eq(schema.sales.saleGroupId, saleGroupId), eq(schema.sales.userId, user.id))
    );
  if (existing.length === 0) {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }

  // Group existing rows by catalog_item_id and validate provided items match
  // exactly. We don't allow add/remove of items here — that's delete+recreate.
  const rowsByItem = new Map<number, typeof existing>();
  for (const r of existing) {
    const arr = rowsByItem.get(r.catalogItemId) ?? [];
    arr.push(r);
    rowsByItem.set(r.catalogItemId, arr);
  }

  if (v.items) {
    const provided = new Set(v.items.map((i) => i.catalogItemId));
    const current = new Set(rowsByItem.keys());
    if (
      provided.size !== current.size ||
      [...provided].some((id) => !current.has(id))
    ) {
      return NextResponse.json(
        {
          error:
            'cannot add or remove items via edit; delete and recreate the sale to change which items were sold',
          providedItems: [...provided],
          currentItems: [...current],
        },
        { status: 422 }
      );
    }
  }

  // For each provided item, redistribute its allocated revenue/fees across
  // the rows for that catalog_item proportional to row quantity, residual
  // on the last row (same rule as matchFifo).
  const rowUpdates = new Map<
    number,
    { salePriceCents: number; feesCents: number }
  >();
  if (v.items) {
    for (const it of v.items) {
      const rows = rowsByItem.get(it.catalogItemId)!;
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
      const allocations = rows.map((r) => ({
        rowId: r.id,
        salePriceCents: Math.floor((it.salePriceCents * r.quantity) / totalQty),
        feesCents: Math.floor((it.feesCents * r.quantity) / totalQty),
      }));
      const sumPrice = allocations.reduce((s, a) => s + a.salePriceCents, 0);
      const sumFees = allocations.reduce((s, a) => s + a.feesCents, 0);
      const last = allocations[allocations.length - 1];
      last.salePriceCents += it.salePriceCents - sumPrice;
      last.feesCents += it.feesCents - sumFees;
      for (const a of allocations) {
        rowUpdates.set(a.rowId, {
          salePriceCents: a.salePriceCents,
          feesCents: a.feesCents,
        });
      }
    }
  }

  // Apply the metadata + per-row updates atomically.
  try {
    await db.transaction(async (tx) => {
      const metaFields: Partial<{
        saleDate: string;
        platform: string | null;
        notes: string | null;
      }> = {};
      if (v.saleDate !== undefined) metaFields.saleDate = v.saleDate;
      if (v.platform !== undefined) metaFields.platform = v.platform;
      if (v.notes !== undefined) metaFields.notes = v.notes;
      if (Object.keys(metaFields).length > 0) {
        await tx
          .update(schema.sales)
          .set(metaFields)
          .where(
            and(
              eq(schema.sales.saleGroupId, saleGroupId),
              eq(schema.sales.userId, user.id)
            )
          );
      }
      for (const [rowId, vals] of rowUpdates) {
        await tx
          .update(schema.sales)
          .set({ salePriceCents: vals.salePriceCents, feesCents: vals.feesCents })
          .where(eq(schema.sales.id, rowId));
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sale update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { saleGroupId } = await ctx.params;

  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    const deleted = await db
      .delete(schema.sales)
      .where(and(eq(schema.sales.saleGroupId, saleGroupId), eq(schema.sales.userId, user.id)))
      .returning({ id: schema.sales.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'sale not found' }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo sale failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
