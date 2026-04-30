import { NextRequest, NextResponse } from 'next/server';
import { eq, asc } from 'drizzle-orm';
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

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  // 1. Saved recipe?
  const saved = await db.query.catalogPackCompositions.findMany({
    where: eq(schema.catalogPackCompositions.sourceCatalogItemId, numericId),
    orderBy: [
      asc(schema.catalogPackCompositions.displayOrder),
      asc(schema.catalogPackCompositions.id),
    ],
  });

  let recipe: Array<{
    packCatalogItemId: number;
    quantity: number;
    packName: string;
    packSetName: string | null;
    packImageUrl: string | null;
  }> | null = null;
  let persisted = false;
  const suggested = false;

  if (saved.length > 0) {
    persisted = true;
    const packIds = saved.map((r) => r.packCatalogItemId);
    const packs = await db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, packIds),
    });
    const byId = new Map(packs.map((p) => [p.id, p]));
    recipe = saved.map((r) => {
      const p = byId.get(r.packCatalogItemId)!;
      return {
        packCatalogItemId: r.packCatalogItemId,
        quantity: r.quantity,
        packName: p.name,
        packSetName: p.setName,
        packImageUrl: p.imageUrl,
      };
    });
  }
  // No auto-derive: same-set Booster Pack heuristics produced wrong recipes
  // for cross-set blisters and Misc-set products. User picks manually first
  // time; recipe is saved on submit so subsequent opens pre-fill.

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
