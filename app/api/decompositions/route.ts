import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count, asc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { decompositionInputSchema } from '@/lib/validation/decomposition';
import { computePerPackCost, computeCostSplitTotal } from '@/lib/services/decompositions';
import { DETERMINISTIC_DECOMPOSITION_TYPES } from '@/lib/services/tcgcsv';
import type { RecipeRow } from '@/lib/validation/decomposition';

// ---------------------------------------------------------------------------
// Recipe resolution
// ---------------------------------------------------------------------------

type ResolvedRecipe = {
  recipe: RecipeRow[];
  persisted: boolean;
  usedBody: boolean;
};

async function resolveRecipe(
  sourceItem: { id: number; productType: string | null; setCode: string | null; setName: string | null; packCount: number | null },
  bodyRecipe: RecipeRow[] | undefined
): Promise<ResolvedRecipe> {
  // 1. Use body recipe if provided.
  if (bodyRecipe && bodyRecipe.length > 0) {
    return { recipe: bodyRecipe, persisted: false, usedBody: true };
  }

  // 2. Check saved recipe.
  const saved = await db.query.catalogPackCompositions.findMany({
    where: eq(schema.catalogPackCompositions.sourceCatalogItemId, sourceItem.id),
    orderBy: [
      asc(schema.catalogPackCompositions.displayOrder),
      asc(schema.catalogPackCompositions.id),
    ],
  });
  if (saved.length > 0) {
    return {
      recipe: saved.map((r) => ({ contentsCatalogItemId: r.contentsCatalogItemId, quantity: r.quantity })),
      persisted: true,
      usedBody: false,
    };
  }

  // 3. Auto-derive for deterministic product types only.
  if (
    sourceItem.productType != null &&
    DETERMINISTIC_DECOMPOSITION_TYPES.has(sourceItem.productType) &&
    sourceItem.packCount != null
  ) {
    const packCandidates = await db.query.catalogItems.findMany({
      where: (ci, ops) =>
        ops.and(
          ops.eq(ci.kind, 'sealed'),
          ops.eq(ci.productType, 'Booster Pack'),
          sourceItem.setCode != null
            ? ops.eq(ci.setCode, sourceItem.setCode)
            : ops.and(ops.isNull(ci.setCode), ops.eq(ci.setName, sourceItem.setName ?? ''))
        ),
    });
    const packCatalog =
      packCandidates.length > 0
        ? [...packCandidates].sort((a, b) => a.name.length - b.name.length)[0]
        : null;
    if (packCatalog) {
      return {
        recipe: [{ contentsCatalogItemId: packCatalog.id, quantity: sourceItem.packCount }],
        persisted: false,
        usedBody: false,
      };
    }
  }

  return { recipe: [], persisted: false, usedBody: false };
}

// ---------------------------------------------------------------------------
// POST /api/decompositions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = decompositionInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

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
      { error: 'decompose source must be a sealed lot' },
      { status: 422 }
    );
  }
  if (sourceItem.productType === 'Booster Pack') {
    return NextResponse.json(
      { error: 'cannot decompose a Booster Pack into packs' },
      { status: 422 }
    );
  }

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

  const { recipe, persisted, usedBody } = await resolveRecipe(sourceItem, v.recipe);

  if (recipe.length === 0) {
    return NextResponse.json(
      {
        error: 'recipe_required',
        message: 'No saved or auto-derived recipe; provide a recipe in the request body.',
      },
      { status: 422 }
    );
  }

  // Validate every row's contents catalog item exists. Allow kind='sealed' OR
  // kind='card'. Reject self-referencing rows.
  const contentsCatalogMap = new Map<number, { id: number; name: string; kind: 'sealed' | 'card' }>();
  for (const row of recipe) {
    if (row.contentsCatalogItemId === sourceItem.id) {
      return NextResponse.json({ error: 'circular_recipe' }, { status: 422 });
    }
    if (!contentsCatalogMap.has(row.contentsCatalogItemId)) {
      const item = await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, row.contentsCatalogItemId),
      });
      if (!item || (item.kind !== 'sealed' && item.kind !== 'card')) {
        return NextResponse.json(
          { error: 'invalid_contents_catalog', contentsCatalogItemId: row.contentsCatalogItemId },
          { status: 422 }
        );
      }
      contentsCatalogMap.set(item.id, { id: item.id, name: item.name, kind: item.kind });
    }
  }

  // Cost split: only sealed-kind rows enter the divisor.
  const costSplitTotal = computeCostSplitTotal(recipe, contentsCatalogMap);
  if (costSplitTotal === 0) {
    return NextResponse.json({ error: 'recipe_must_contain_sealed_row' }, { status: 422 });
  }
  const sourceCostCents = sourcePurchase.costCents;
  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    sourceCostCents,
    costSplitTotal
  );

  const today = new Date().toISOString().slice(0, 10);
  const decomposeDate = v.decomposeDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      // Persist recipe when: caller supplied it (usedBody) OR auto-derived
      // (not yet persisted).
      if (usedBody || (!usedBody && !persisted)) {
        await tx
          .delete(schema.catalogPackCompositions)
          .where(
            eq(schema.catalogPackCompositions.sourceCatalogItemId, sourceItem.id)
          );
        for (let i = 0; i < recipe.length; i++) {
          await tx.insert(schema.catalogPackCompositions).values({
            sourceCatalogItemId: sourceItem.id,
            contentsCatalogItemId: recipe[i].contentsCatalogItemId,
            quantity: recipe[i].quantity,
            displayOrder: i,
          });
        }
      }

      const [decomposition] = await tx
        .insert(schema.boxDecompositions)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          decomposeDate,
          sourceCostCents,
          packCount: costSplitTotal,
          perPackCostCents,
          roundingResidualCents,
          notes: v.notes ?? null,
        })
        .returning();

      const packPurchases = [];
      for (const row of recipe) {
        const contents = contentsCatalogMap.get(row.contentsCatalogItemId)!;
        const childCostCents = contents.kind === 'card' ? 0 : perPackCostCents;
        const [child] = await tx
          .insert(schema.purchases)
          .values({
            userId: user.id,
            catalogItemId: row.contentsCatalogItemId,
            purchaseDate: decomposeDate,
            quantity: row.quantity,
            costCents: childCostCents,
            condition: null,
            isGraded: false,
            gradingCompany: null,
            grade: null,
            certNumber: null,
            unknownCost: sourcePurchase.unknownCost,
            source: null,
            location: null,
            notes: null,
            sourceDecompositionId: decomposition.id,
          })
          .returning();
        packPurchases.push(child);
      }

      return { decomposition, packPurchases };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'decomposition create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
