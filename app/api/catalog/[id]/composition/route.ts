import { NextRequest, NextResponse } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { DETERMINISTIC_DECOMPOSITION_TYPES } from '@/lib/services/tcgcsv';

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

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const saved = await db.query.catalogPackCompositions.findMany({
    where: eq(schema.catalogPackCompositions.sourceCatalogItemId, numericId),
    orderBy: [
      asc(schema.catalogPackCompositions.displayOrder),
      asc(schema.catalogPackCompositions.id),
    ],
  });

  let recipe: Array<{
    contentsCatalogItemId: number;
    quantity: number;
    contentsName: string;
    contentsSetName: string | null;
    contentsImageUrl: string | null;
    contentsKind: 'sealed' | 'card';
    contentsProductType: string | null;
  }> | null = null;
  let persisted = false;
  let suggested = false;

  if (saved.length > 0) {
    persisted = true;
    const contentsIds = saved.map((r) => r.contentsCatalogItemId);
    const contents = await db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, contentsIds),
    });
    const byId = new Map(contents.map((c) => [c.id, c]));
    recipe = saved.map((r) => {
      const c = byId.get(r.contentsCatalogItemId)!;
      return {
        contentsCatalogItemId: r.contentsCatalogItemId,
        quantity: r.quantity,
        contentsName: c.name,
        contentsSetName: c.setName,
        contentsImageUrl: c.imageUrl,
        contentsKind: c.kind as 'sealed' | 'card',
        contentsProductType: c.productType,
      };
    });
  } else if (
    sourceItem.kind === 'sealed' &&
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
      suggested = true;
      recipe = [
        {
          contentsCatalogItemId: packCatalog.id,
          quantity: sourceItem.packCount,
          contentsName: packCatalog.name,
          contentsSetName: packCatalog.setName,
          contentsImageUrl: packCatalog.imageUrl,
          contentsKind: packCatalog.kind as 'sealed' | 'card',
          contentsProductType: packCatalog.productType,
        },
      ];
    }
  }

  return NextResponse.json({
    sourceCatalogItemId: numericId,
    sourceName: sourceItem.name,
    sourcePackCount: sourceItem.packCount,
    sourceProductType: sourceItem.productType,
    recipe,
    persisted,
    suggested,
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

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const result = await db
    .delete(schema.catalogPackCompositions)
    .where(eq(schema.catalogPackCompositions.sourceCatalogItemId, numericId))
    .returning({ id: schema.catalogPackCompositions.id });

  return NextResponse.json({ deleted: result.length });
}
