import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rip = await db.query.rips.findFirst({
    where: and(eq(schema.rips.id, numericId), eq(schema.rips.userId, user.id)),
  });
  if (!rip) {
    return NextResponse.json({ error: 'rip not found' }, { status: 404 });
  }

  const sourcePurchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, rip.sourcePurchaseId),
  });
  const sourceCatalogItem = sourcePurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
      })
    : null;

  const keptPurchases = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.sourceRipId, rip.id),
      isNull(schema.purchases.deletedAt)
    ),
  });
  const keptCatalogIds = keptPurchases.map((p) => p.catalogItemId);
  const keptCatalogItems =
    keptCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: (ci, ops) => ops.inArray(ci.id, keptCatalogIds),
        })
      : [];
  const byCatalogId = new Map(keptCatalogItems.map((i) => [i.id, i]));

  return NextResponse.json({
    rip,
    sourcePurchase,
    sourceCatalogItem,
    keptPurchases: keptPurchases.map((p) => ({
      purchase: p,
      catalogItem: byCatalogId.get(p.catalogItemId) ?? null,
    })),
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rip = await db.query.rips.findFirst({
    where: and(eq(schema.rips.id, numericId), eq(schema.rips.userId, user.id)),
  });
  if (!rip) {
    return NextResponse.json({ error: 'rip not found' }, { status: 404 });
  }

  // Block if any child has linked sales. Use Supabase nested join with
  // RLS scoping to filter to the current user.
  const { data: linkedSales, error: salesErr } = await supabase
    .from('sales')
    .select('id, purchase_id, purchases!inner(source_rip_id)')
    .eq('purchases.source_rip_id', numericId);
  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }
  if (linkedSales && linkedSales.length > 0) {
    return NextResponse.json(
      {
        error: 'rip has linked sales on its kept cards',
        linkedSaleIds: linkedSales.map((s) => s.id),
      },
      { status: 409 }
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.purchases)
        .set({ deletedAt: new Date(), sourceRipId: null })
        .where(eq(schema.purchases.sourceRipId, numericId));
      await tx.delete(schema.rips).where(eq(schema.rips.id, numericId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo rip failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
