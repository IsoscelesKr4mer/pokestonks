import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull, asc, desc, inArray, lte } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computeHoldingPnL, emptyHoldingPnL } from '@/lib/services/pnl';
import { buildActivityEvents } from '@/lib/api/holdingDetailDto';
import { computeDeltas } from '@/lib/services/price-deltas';

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

  // For provenance display on pack-child lots: source decomposition + source container catalog item.
  const sourceDecompositionIds = lots
    .map((l) => l.sourceDecompositionId)
    .filter((v): v is number => v != null);
  const sourceDecompositions =
    sourceDecompositionIds.length > 0
      ? await db.query.boxDecompositions.findMany({
          where: inArray(schema.boxDecompositions.id, sourceDecompositionIds),
        })
      : [];
  const decompById = new Map(sourceDecompositions.map((d) => [d.id, d]));
  const sourceContainerPurchaseIds = sourceDecompositions.map((d) => d.sourcePurchaseId);
  const sourceContainerPurchases =
    sourceContainerPurchaseIds.length > 0
      ? await db.query.purchases.findMany({
          where: inArray(schema.purchases.id, sourceContainerPurchaseIds),
        })
      : [];
  const sourceContainerByPurchaseId = new Map(sourceContainerPurchases.map((p) => [p.id, p]));
  const sourceContainerCatalogIds = sourceContainerPurchases.map((p) => p.catalogItemId);
  const sourceContainerCatalogs =
    sourceContainerCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: inArray(schema.catalogItems.id, sourceContainerCatalogIds),
        })
      : [];
  const sourceContainerCatalogById = new Map(sourceContainerCatalogs.map((c) => [c.id, c]));

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

  // For sealed: decompositions sourced from these lots.
  const decompositionsForSealed =
    item.kind === 'sealed' && lotIds.length > 0
      ? await db.query.boxDecompositions.findMany({
          where: inArray(schema.boxDecompositions.sourcePurchaseId, lotIds),
        })
      : [];

  // Compute the per-item rollup using the same aggregation as the list endpoint.
  const rawPurchases: RawPurchaseRow[] = lots.map((l) => ({
    id: l.id,
    catalog_item_id: l.catalogItemId,
    quantity: l.quantity,
    cost_cents: l.costCents,
    unknown_cost: l.unknownCost,
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
      last_market_at: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
    },
  }));
  const rawRips: RawRipRow[] = ripsForSealed.map((r) => ({
    id: r.id,
    source_purchase_id: r.sourcePurchaseId,
  }));
  const rawDecompositions: RawDecompositionRow[] = decompositionsForSealed.map((d) => ({
    id: d.id,
    source_purchase_id: d.sourcePurchaseId,
  }));
  // Sales linked to lots of this holding.
  const salesForLots =
    lotIds.length > 0
      ? await db.query.sales.findMany({
          where: and(
            eq(schema.sales.userId, user.id),
            inArray(schema.sales.purchaseId, lotIds)
          ),
          orderBy: [desc(schema.sales.saleDate), asc(schema.sales.saleGroupId), asc(schema.sales.id)],
        })
      : [];

  const rawSales: RawSaleRow[] = salesForLots.map((s) => ({
    id: Number(s.id),
    purchase_id: s.purchaseId,
    quantity: s.quantity,
  }));
  const [holdingRaw] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions, rawSales);
  const now = new Date();
  const holding = holdingRaw ? computeHoldingPnL(holdingRaw, now) : null;

  // Fetch delta + manual fields (same pattern as /api/holdings T11).
  let delta7dCents: number | null = null;
  let delta7dPct: number | null = null;
  let manualMarketCents: number | null = null;

  {
    // Manual price override.
    const [manualRow] = await db.query.catalogItems.findMany({
      where: eq(schema.catalogItems.id, numericId),
      columns: { id: true, manualMarketCents: true },
    });
    manualMarketCents = manualRow?.manualMarketCents ?? null;

    // "Then" price: latest market_prices row at or before 7 days ago.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const thenRows = await db.query.marketPrices.findMany({
      where: and(
        eq(schema.marketPrices.catalogItemId, numericId),
        lte(schema.marketPrices.snapshotDate, sevenDaysAgo)
      ),
      columns: { catalogItemId: true, snapshotDate: true, marketPriceCents: true },
      orderBy: [desc(schema.marketPrices.snapshotDate)],
    });
    const thenCents = thenRows.length > 0 ? thenRows[0].marketPriceCents : null;

    const nowCents = manualMarketCents ?? holding?.lastMarketCents ?? item.lastMarketCents ?? null;
    const deltaMap = computeDeltas([{ catalogItemId: numericId, nowCents, thenCents }]);
    const deltaOut = deltaMap.get(numericId) ?? { deltaCents: null, deltaPct: null };
    delta7dCents = deltaOut.deltaCents;
    delta7dPct = deltaOut.deltaPct;
  }

  // Build consumed-units map for qtyRemaining per lot.
  const consumedUnitsByLot = new Map<number, number>();
  for (const r of ripsForSealed) {
    consumedUnitsByLot.set(r.sourcePurchaseId, (consumedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
  }
  for (const d of decompositionsForSealed) {
    consumedUnitsByLot.set(d.sourcePurchaseId, (consumedUnitsByLot.get(d.sourcePurchaseId) ?? 0) + 1);
  }

  // Annotate lots with provenance + qtyRemaining for the UI.
  const lotsWithProvenance = lots.map((l) => {
    const rip = l.sourceRipId != null ? ripById.get(l.sourceRipId) ?? null : null;
    const pack = rip ? sourcePackByPurchaseId.get(rip.sourcePurchaseId) ?? null : null;
    const packCatalog = pack ? sourcePackCatalogById.get(pack.catalogItemId) ?? null : null;

    const decomp = l.sourceDecompositionId != null
      ? decompById.get(l.sourceDecompositionId) ?? null
      : null;
    const container = decomp
      ? sourceContainerByPurchaseId.get(decomp.sourcePurchaseId) ?? null
      : null;
    const containerCatalog = container
      ? sourceContainerCatalogById.get(container.catalogItemId) ?? null
      : null;

    const consumed = consumedUnitsByLot.get(l.id) ?? 0;
    const qtyRemaining = l.quantity - consumed;

    return {
      lot: {
        id: l.id,
        catalogItemId: l.catalogItemId,
        purchaseDate: l.purchaseDate,
        quantity: l.quantity,
        costCents: l.costCents,
        condition: l.condition,
        isGraded: l.isGraded,
        gradingCompany: l.gradingCompany,
        grade: l.grade,
        certNumber: l.certNumber,
        source: l.source,
        location: l.location,
        notes: l.notes,
        sourceRipId: l.sourceRipId,
        sourceDecompositionId: l.sourceDecompositionId,
        createdAt: l.createdAt.toISOString(),
      },
      qtyRemaining,
      sourceRip: rip ? { id: rip.id, ripDate: rip.ripDate, sourcePurchaseId: rip.sourcePurchaseId } : null,
      sourcePack: packCatalog ? { catalogItemId: packCatalog.id, name: packCatalog.name } : null,
      sourceDecomposition: decomp
        ? { id: decomp.id, decomposeDate: decomp.decomposeDate, sourcePurchaseId: decomp.sourcePurchaseId }
        : null,
      sourceContainer: containerCatalog
        ? { catalogItemId: containerCatalog.id, name: containerCatalog.name }
        : null,
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

  // Decomposition rows summary (only meaningful for sealed).
  const decompositionsSummary =
    item.kind === 'sealed'
      ? decompositionsForSealed.map((d) => ({
          id: d.id,
          decomposeDate: d.decomposeDate,
          sourceCostCents: d.sourceCostCents,
          packCount: d.packCount,
          perPackCostCents: d.perPackCostCents,
          roundingResidualCents: d.roundingResidualCents,
          sourcePurchaseId: d.sourcePurchaseId,
          notes: d.notes,
        }))
      : [];

  // Group sales by sale_group_id for response shape.
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const salesGroupedById = new Map<string, typeof salesForLots>();
  for (const s of salesForLots) {
    const arr = salesGroupedById.get(s.saleGroupId) ?? [];
    arr.push(s);
    salesGroupedById.set(s.saleGroupId, arr);
  }
  const salesEvents = Array.from(salesGroupedById.entries())
    .map(([saleGroupId, rows]) => {
      const totals = rows.reduce(
        (acc, r) => ({
          quantity: acc.quantity + r.quantity,
          salePriceCents: acc.salePriceCents + r.salePriceCents,
          feesCents: acc.feesCents + r.feesCents,
          matchedCostCents: acc.matchedCostCents + r.matchedCostCents,
        }),
        { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
      );
      const first = rows[0];
      return {
        saleGroupId,
        saleDate: first.saleDate,
        platform: first.platform,
        notes: first.notes,
        totals: {
          ...totals,
          realizedPnLCents: totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
        },
        rows: rows.map((r) => {
          const lot = lotById.get(r.purchaseId);
          return {
            saleId: Number(r.id),
            purchaseId: r.purchaseId,
            purchaseDate: lot?.purchaseDate ?? '',
            perUnitCostCents: lot?.costCents ?? 0,
            quantity: r.quantity,
            salePriceCents: r.salePriceCents,
            feesCents: r.feesCents,
            matchedCostCents: r.matchedCostCents,
          };
        }),
        createdAt: first.createdAt instanceof Date ? first.createdAt.toISOString() : first.createdAt,
      };
    })
    .sort((a, b) => {
      if (a.saleDate !== b.saleDate) return a.saleDate < b.saleDate ? 1 : -1;
      return a.saleGroupId < b.saleGroupId ? -1 : a.saleGroupId > b.saleGroupId ? 1 : 0;
    });

  // Build activity events from all raw data.
  const activity = buildActivityEvents({
    purchases: lots.map((l) => ({
      id: l.id,
      purchaseDate: l.purchaseDate,
      quantity: l.quantity,
      costCents: l.costCents,
      source: l.source,
      location: l.location,
      sourceRipId: l.sourceRipId,
      sourceDecompositionId: l.sourceDecompositionId,
    })),
    rips: ripsSummary,
    decompositions: decompositionsForSealed.map((d) => ({
      id: d.id,
      decomposeDate: d.decomposeDate,
      sourcePurchaseId: d.sourcePurchaseId,
      packCount: d.packCount,
    })),
    sales: salesEvents.map((s) => ({
      id: s.saleGroupId,
      saleGroupId: s.saleGroupId,
      saleDate: s.saleDate,
      quantity: s.totals.quantity,
      salePriceCents: s.totals.salePriceCents,
      feesCents: s.totals.feesCents,
      platform: s.platform,
      matchedCostCents: s.totals.matchedCostCents,
    })),
  });

  const holdingBase = holding ?? emptyHoldingPnL({
    id: item.id,
    name: item.name,
    kind: item.kind as 'sealed' | 'card',
    imageUrl: item.imageUrl,
    imageStoragePath: item.imageStoragePath,
    setName: item.setName,
    productType: item.productType,
    lastMarketCents: item.lastMarketCents,
    lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
  });

  return NextResponse.json({
    item: {
      id: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      setCode: item.setCode,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
      msrpCents: item.msrpCents,
      packCount: item.packCount,
    },
    holding: {
      ...holdingBase,
      delta7dCents,
      delta7dPct,
      manualMarketCents,
    },
    lots: lotsWithProvenance,
    rips: ripsSummary,
    decompositions: decompositionsSummary,
    sales: salesEvents,
    activity,
  });
}
