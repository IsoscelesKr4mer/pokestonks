import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { ripInputSchema } from '@/lib/validation/rip';
import { computeRealizedLoss } from '@/lib/services/rips';

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
  const parsed = ripInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // 3. Lookup source purchase + its catalog item via Drizzle.
  //    We must verify user_id ourselves because Drizzle bypasses RLS.
  const sourcePurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, v.sourcePurchaseId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!sourcePurchase || sourcePurchase.deletedAt != null) {
    return NextResponse.json({ error: 'source purchase not found' }, { status: 404 });
  }

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'source catalog item not found' }, { status: 404 });
  }
  if (sourceItem.kind !== 'sealed') {
    return NextResponse.json(
      { error: 'rip source must be a sealed lot' },
      { status: 422 }
    );
  }

  // 4. qty_remaining = quantity - count(rips referencing this purchase).
  const [{ ripped }] = await db
    .select({ ripped: count() })
    .from(schema.rips)
    .where(eq(schema.rips.sourcePurchaseId, sourcePurchase.id));
  const qtyRemaining = sourcePurchase.quantity - Number(ripped);
  if (qtyRemaining < 1) {
    return NextResponse.json(
      { error: 'pack already fully ripped' },
      { status: 422 }
    );
  }

  // 5. Verify all kept-card catalog items exist and are kind='card'.
  if (v.keptCards.length > 0) {
    const ids = v.keptCards.map((k) => k.catalogItemId);
    const keptItems = await db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, ids),
    });
    const byId = new Map(keptItems.map((i) => [i.id, i]));
    for (const k of v.keptCards) {
      const item = byId.get(k.catalogItemId);
      if (!item) {
        return NextResponse.json(
          { error: `kept card catalog item not found: ${k.catalogItemId}` },
          { status: 422 }
        );
      }
      if (item.kind !== 'card') {
        return NextResponse.json(
          { error: 'kept card must be kind=card' },
          { status: 422 }
        );
      }
    }
  }

  // 6. Snapshot pack cost + compute realized loss.
  const packCostCents = sourcePurchase.costCents;
  const realizedLossCents = computeRealizedLoss(
    packCostCents,
    v.keptCards.map((k) => k.costCents)
  );

  // 7. Transaction: insert rip + N child purchases atomically.
  const today = new Date().toISOString().slice(0, 10);
  const ripDate = v.ripDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      const [rip] = await tx
        .insert(schema.rips)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          ripDate,
          packCostCents,
          realizedLossCents,
          notes: v.notes ?? null,
        })
        .returning();

      const keptPurchases = [];
      for (const k of v.keptCards) {
        const [child] = await tx
          .insert(schema.purchases)
          .values({
            userId: user.id,
            catalogItemId: k.catalogItemId,
            purchaseDate: ripDate,
            quantity: 1,
            costCents: k.costCents,
            condition: k.condition ?? 'NM',
            isGraded: k.isGraded ?? false,
            gradingCompany: k.isGraded ? k.gradingCompany ?? null : null,
            grade: k.isGraded && k.grade != null ? String(k.grade) : null,
            certNumber: k.isGraded ? k.certNumber ?? null : null,
            unknownCost: sourcePurchase.unknownCost,
            source: null,
            location: null,
            notes: k.notes ?? null,
            sourceRipId: rip.id,
          })
          .returning();
        keptPurchases.push(child);
      }

      return { rip, keptPurchases };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rip create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
