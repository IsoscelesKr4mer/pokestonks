import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ catalogItemId: string }> }
) {
  const { catalogItemId } = await ctx.params;
  const numericId = Number(catalogItemId);
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

  // Catalog item (public-read).
  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  // Lots for this user + item, FIFO order. Soft-deleted excluded.
  const lots = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.userId, user.id),
      eq(schema.purchases.catalogItemId, numericId),
      isNull(schema.purchases.deletedAt)
    ),
    orderBy: [asc(schema.purchases.purchaseDate), asc(schema.purchases.id)],
  });

  // For provenance display on card lots: source rip + source pack catalog item.
  const sourceRipIds = lots.map((l) => l.sourceRipId).filter((v): v is number => v != null);
  const sourceRips =
    sourceRipIds.length > 0
      ? await db.query.rips.findMany({
          where: inArray(schema.rips.id, sourceRipIds),
        })
      : [];
  const ripById = new Map(sourceRips.map((r) => [r.id, r]));
  const sourcePackPurchaseIds = sourceRips.map((r) => r.sourcePurchaseId);
  const sourcePackPurchases =
    sourcePackPurchaseIds.length > 0
      ? await db.query.purchases.findMany({
          where: inArray(schema.purchases.id, sourcePackPurchaseIds),
        })
      : [];
  const sourcePackByPurchaseId = new Map(sourcePackPurchases.map((p) => [p.id, p]));
  const sourcePackCatalogIds = sourcePackPurchases.map((p) => p.catalogItemId);
  const sourcePackCatalogItems =
    sourcePackCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: inArray(schema.catalogItems.id, sourcePackCatalogIds),
        })
      : [];
  const sourcePackCatalogById = new Map(sourcePackCatalogItems.map((c) => [c.id, c]));

  // For sealed: rips for these lots, with kept_card_count.
  const lotIds = lots.map((l) => l.id);
  const ripsForSealed =
    item.kind === 'sealed' && lotIds.length > 0
      ? await db.query.rips.findMany({
          where: inArray(schema.rips.sourcePurchaseId, lotIds),
        })
      : [];
  const ripIdsForKeptCount = ripsForSealed.map((r) => r.id);
  const keptChildren =
    ripIdsForKeptCount.length > 0
      ? await db.query.purchases.findMany({
          where: and(
            inArray(schema.purchases.sourceRipId, ripIdsForKeptCount),
            isNull(schema.purchases.deletedAt)
          ),
        })
      : [];
  const keptCountByRipId = keptChildren.reduce<Map<number, number>>((acc, p) => {
    acc.set(p.sourceRipId!, (acc.get(p.sourceRipId!) ?? 0) + 1);
    return acc;
  }, new Map());

  // Compute the per-item rollup using the same aggregation as the list endpoint.
  // We need a synthetic RawPurchaseRow shape to reuse aggregateHoldings.
  const rawPurchases: RawPurchaseRow[] = lots.map((l) => ({
    id: l.id,
    catalog_item_id: l.catalogItemId,
    quantity: l.quantity,
    cost_cents: l.costCents,
    deleted_at: l.deletedAt ? l.deletedAt.toISOString() : null,
    created_at: l.createdAt.toISOString(),
    catalog_item: {
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      set_name: item.setName,
      product_type: item.productType,
      image_url: item.imageUrl,
      image_storage_path: item.imageStoragePath,
      last_market_cents: item.lastMarketCents,
    },
  }));
  const rawRips: RawRipRow[] = ripsForSealed.map((r) => ({
    id: r.id,
    source_purchase_id: r.sourcePurchaseId,
  }));
  const [holding] = aggregateHoldings(rawPurchases, rawRips, []);

  // Annotate lots with provenance for the UI.
  const lotsWithProvenance = lots.map((l) => {
    if (l.sourceRipId == null) return { lot: l, sourceRip: null, sourcePack: null };
    const rip = ripById.get(l.sourceRipId) ?? null;
    const pack = rip ? sourcePackByPurchaseId.get(rip.sourcePurchaseId) ?? null : null;
    const packCatalog = pack ? sourcePackCatalogById.get(pack.catalogItemId) ?? null : null;
    return {
      lot: l,
      sourceRip: rip ? { id: rip.id, ripDate: rip.ripDate, sourcePurchaseId: rip.sourcePurchaseId } : null,
      sourcePack: packCatalog ? { catalogItemId: packCatalog.id, name: packCatalog.name } : null,
    };
  });

  // Rip rows summary (only meaningful for sealed).
  const ripsSummary =
    item.kind === 'sealed'
      ? ripsForSealed.map((r) => ({
          id: r.id,
          ripDate: r.ripDate,
          packCostCents: r.packCostCents,
          realizedLossCents: r.realizedLossCents,
          keptCardCount: keptCountByRipId.get(r.id) ?? 0,
          sourcePurchaseId: r.sourcePurchaseId,
          notes: r.notes,
        }))
      : [];

  return NextResponse.json({
    item: {
      id: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      msrpCents: item.msrpCents,
    },
    holding: holding ?? {
      catalogItemId: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      qtyHeld: 0,
      totalInvestedCents: 0,
    },
    lots: lotsWithProvenance,
    rips: ripsSummary,
  });
}
