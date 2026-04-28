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

  const decomposition = await db.query.boxDecompositions.findFirst({
    where: and(
      eq(schema.boxDecompositions.id, numericId),
      eq(schema.boxDecompositions.userId, user.id)
    ),
  });
  if (!decomposition) {
    return NextResponse.json({ error: 'decomposition not found' }, { status: 404 });
  }

  const sourcePurchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, decomposition.sourcePurchaseId),
  });
  const sourceCatalogItem = sourcePurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
      })
    : null;

  const packPurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.sourceDecompositionId, decomposition.id),
      isNull(schema.purchases.deletedAt)
    ),
  });
  const packCatalogItem = packPurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, packPurchase.catalogItemId),
      })
    : null;

  return NextResponse.json({
    decomposition,
    sourcePurchase,
    sourceCatalogItem,
    packPurchase,
    packCatalogItem,
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

  const decomposition = await db.query.boxDecompositions.findFirst({
    where: and(
      eq(schema.boxDecompositions.id, numericId),
      eq(schema.boxDecompositions.userId, user.id)
    ),
  });
  if (!decomposition) {
    return NextResponse.json({ error: 'decomposition not found' }, { status: 404 });
  }

  // Find the child pack purchase id (used for the linked-rips and linked-sales checks below).
  const packChild = await db.query.purchases.findFirst({
    where: eq(schema.purchases.sourceDecompositionId, numericId),
  });

  if (packChild) {
    // Block if any rips reference the pack child (the user has already started ripping packs).
    const { data: linkedRips, error: ripsErr } = await supabase
      .from('rips')
      .select('id')
      .eq('source_purchase_id', packChild.id);
    if (ripsErr) {
      return NextResponse.json({ error: ripsErr.message }, { status: 500 });
    }
    if (linkedRips && linkedRips.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked rips on its packs',
          linkedRipIds: linkedRips.map((r) => r.id),
        },
        { status: 409 }
      );
    }

    // Defensive Plan 5 check: block if any sales reference the pack child.
    const { data: linkedSales, error: salesErr } = await supabase
      .from('sales')
      .select('id')
      .eq('purchase_id', packChild.id);
    if (salesErr) {
      return NextResponse.json({ error: salesErr.message }, { status: 500 });
    }
    if (linkedSales && linkedSales.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked sales on its packs',
          linkedSaleIds: linkedSales.map((s) => s.id),
        },
        { status: 409 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.purchases)
        .set({ deletedAt: new Date() })
        .where(eq(schema.purchases.sourceDecompositionId, numericId));
      await tx.delete(schema.boxDecompositions).where(eq(schema.boxDecompositions.id, numericId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo decomposition failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
