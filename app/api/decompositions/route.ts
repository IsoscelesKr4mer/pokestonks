import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { decompositionInputSchema } from '@/lib/validation/decomposition';
import { computePerPackCost } from '@/lib/services/decompositions';

export async function POST(request: NextRequest) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Validate.
  const json = await request.json().catch(() => null);
  const parsed = decompositionInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // 3. Lookup source purchase. Drizzle bypasses RLS -- verify user_id manually.
  const sourcePurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, v.sourcePurchaseId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!sourcePurchase || sourcePurchase.deletedAt != null) {
    return NextResponse.json({ error: 'source purchase not found' }, { status: 404 });
  }

  // 4. Lookup source catalog item. Verify kind=sealed and pack_count > 1.
  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'source catalog item not found' }, { status: 404 });
  }
  if (sourceItem.kind !== 'sealed') {
    return NextResponse.json(
      { error: 'decompose source must be a sealed lot' },
      { status: 422 }
    );
  }
  if (sourceItem.packCount == null || sourceItem.packCount <= 1) {
    return NextResponse.json(
      { error: 'this product type is not decomposable' },
      { status: 422 }
    );
  }

  // 5. qty_remaining = quantity - count(rips) - count(decompositions).
  const [{ ripped }] = await db
    .select({ ripped: count() })
    .from(schema.rips)
    .where(eq(schema.rips.sourcePurchaseId, sourcePurchase.id));
  const [{ decomposed }] = await db
    .select({ decomposed: count() })
    .from(schema.boxDecompositions)
    .where(eq(schema.boxDecompositions.sourcePurchaseId, sourcePurchase.id));
  const qtyRemaining = sourcePurchase.quantity - Number(ripped) - Number(decomposed);
  if (qtyRemaining < 1) {
    return NextResponse.json(
      { error: 'box already fully consumed' },
      { status: 422 }
    );
  }

  // 6. Look up the corresponding Booster Pack catalog row.
  const packCatalog = await db.query.catalogItems.findFirst({
    where: (ci, ops) =>
      ops.and(
        ops.eq(ci.kind, 'sealed'),
        ops.eq(ci.productType, 'Booster Pack'),
        sourceItem.setCode != null
          ? ops.eq(ci.setCode, sourceItem.setCode)
          : ops.and(ops.isNull(ci.setCode), ops.eq(ci.setName, sourceItem.setName ?? ''))
      ),
  });
  if (!packCatalog) {
    return NextResponse.json(
      {
        error: 'booster pack catalog row not found for this set',
        setCode: sourceItem.setCode,
        setName: sourceItem.setName,
      },
      { status: 422 }
    );
  }

  // 7. Snapshot source cost + compute per-pack cost.
  const sourceCostCents = sourcePurchase.costCents;
  const packCount = sourceItem.packCount;
  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    sourceCostCents,
    packCount
  );

  // 8. Transaction: insert decomposition + child pack purchase atomically.
  const today = new Date().toISOString().slice(0, 10);
  const decomposeDate = v.decomposeDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      const [decomposition] = await tx
        .insert(schema.boxDecompositions)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          decomposeDate,
          sourceCostCents,
          packCount,
          perPackCostCents,
          roundingResidualCents,
          notes: v.notes ?? null,
        })
        .returning();

      const [packPurchase] = await tx
        .insert(schema.purchases)
        .values({
          userId: user.id,
          catalogItemId: packCatalog.id,
          purchaseDate: decomposeDate,
          quantity: packCount,
          costCents: perPackCostCents,
          condition: null,
          isGraded: false,
          gradingCompany: null,
          grade: null,
          certNumber: null,
          source: null,
          location: null,
          notes: null,
          sourceDecompositionId: decomposition.id,
        })
        .returning();

      return { decomposition, packPurchase };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'decomposition create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
