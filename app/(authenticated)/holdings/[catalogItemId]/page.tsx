import { notFound, redirect } from 'next/navigation';
import { eq, and, isNull, asc, desc, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { HoldingDetailClient } from './HoldingDetailClient';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computeHoldingPnL } from '@/lib/services/pnl';
import type { HoldingDetailDto, HoldingDetailSaleEvent } from '@/lib/api/holdingDetailDto';
import { buildActivityEvents } from '@/lib/api/holdingDetailDto';

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const { catalogItemId } = await params;
  const numericId = Number(catalogItemId);
  if (!Number.isFinite(numericId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) notFound();

  const lots = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.userId, user.id),
      eq(schema.purchases.catalogItemId, numericId),
      isNull(schema.purchases.deletedAt)
    ),
    orderBy: [asc(schema.purchases.purchaseDate), asc(schema.purchases.id)],
  });

  // Provenance for card lots.
  const sourceRipIds = lots.map((l) => l.sourceRipId).filter((v): v is number => v != null);
  const sourceRips = sourceRipIds.length
    ? await db.query.rips.findMany({ where: inArray(schema.rips.id, sourceRipIds) })
    : [];
  const ripById = new Map(sourceRips.map((r) => [r.id, r]));
  const sourcePackPurchaseIds = sourceRips.map((r) => r.sourcePurchaseId);
  const sourcePackPurchases = sourcePackPurchaseIds.length
    ? await db.query.purchases.findMany({ where: inArray(schema.purchases.id, sourcePackPurchaseIds) })
    : [];
  const sourcePackByPurchaseId = new Map(sourcePackPurchases.map((p) => [p.id, p]));
  const sourcePackCatalogIds = sourcePackPurchases.map((p) => p.catalogItemId);
  const sourcePackCatalogs = sourcePackCatalogIds.length
    ? await db.query.catalogItems.findMany({ where: inArray(schema.catalogItems.id, sourcePackCatalogIds) })
    : [];
  const sourcePackCatalogById = new Map(sourcePackCatalogs.map((c) => [c.id, c]));

  // Provenance for pack-child lots (decomposition source).
  const sourceDecompositionIds = lots
    .map((l) => l.sourceDecompositionId)
    .filter((v): v is number => v != null);
  const sourceDecompositions = sourceDecompositionIds.length
    ? await db.query.boxDecompositions.findMany({
        where: inArray(schema.boxDecompositions.id, sourceDecompositionIds),
      })
    : [];
  const decompById = new Map(sourceDecompositions.map((d) => [d.id, d]));
  const sourceContainerPurchaseIds = sourceDecompositions.map((d) => d.sourcePurchaseId);
  const sourceContainerPurchases = sourceContainerPurchaseIds.length
    ? await db.query.purchases.findMany({
        where: inArray(schema.purchases.id, sourceContainerPurchaseIds),
      })
    : [];
  const sourceContainerByPurchaseId = new Map(sourceContainerPurchases.map((p) => [p.id, p]));
  const sourceContainerCatalogIds = sourceContainerPurchases.map((p) => p.catalogItemId);
  const sourceContainerCatalogs = sourceContainerCatalogIds.length
    ? await db.query.catalogItems.findMany({
        where: inArray(schema.catalogItems.id, sourceContainerCatalogIds),
      })
    : [];
  const sourceContainerCatalogById = new Map(sourceContainerCatalogs.map((c) => [c.id, c]));

  // Rips for sealed.
  const lotIds = lots.map((l) => l.id);
  const ripsForSealed =
    item.kind === 'sealed' && lotIds.length
      ? await db.query.rips.findMany({ where: inArray(schema.rips.sourcePurchaseId, lotIds) })
      : [];
  const keptChildren = ripsForSealed.length
    ? await db.query.purchases.findMany({
        where: and(
          inArray(schema.purchases.sourceRipId, ripsForSealed.map((r) => r.id)),
          isNull(schema.purchases.deletedAt)
        ),
      })
    : [];
  const keptCountByRipId = keptChildren.reduce<Map<number, number>>((acc, p) => {
    acc.set(p.sourceRipId!, (acc.get(p.sourceRipId!) ?? 0) + 1);
    return acc;
  }, new Map());

  // Decompositions for sealed.
  const decompositionsForSealed =
    item.kind === 'sealed' && lotIds.length
      ? await db.query.boxDecompositions.findMany({
          where: inArray(schema.boxDecompositions.sourcePurchaseId, lotIds),
        })
      : [];

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

  // Rollup.
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
  const rawSales: RawSaleRow[] = salesForLots.map((s) => ({
    id: Number(s.id),
    purchase_id: s.purchaseId,
    quantity: s.quantity,
  }));
  const [holdingRaw] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions, rawSales);
  const now = new Date();
  const holding = holdingRaw ? computeHoldingPnL(holdingRaw, now) : null;

  // Build consumed-units map for qtyRemaining per lot.
  const consumedUnitsByLot = new Map<number, number>();
  for (const r of ripsForSealed) {
    consumedUnitsByLot.set(r.sourcePurchaseId, (consumedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
  }
  for (const d of decompositionsForSealed) {
    consumedUnitsByLot.set(d.sourcePurchaseId, (consumedUnitsByLot.get(d.sourcePurchaseId) ?? 0) + 1);
  }

  // Group sales by sale_group_id for response shape.
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const salesGroupedById = new Map<string, typeof salesForLots>();
  for (const s of salesForLots) {
    const arr = salesGroupedById.get(s.saleGroupId) ?? [];
    arr.push(s);
    salesGroupedById.set(s.saleGroupId, arr);
  }
  const salesEvents: HoldingDetailSaleEvent[] = Array.from(salesGroupedById.entries())
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
        unknownCost: rows.some((r) => lotById.get(r.purchaseId)?.unknownCost ?? false),
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
            unknownCost: lot?.unknownCost ?? false,
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

  // Build activity events for SSR pass.
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
      unknownCost: s.unknownCost,
    })),
  });

  // Storefront listing for this user + item.
  const storefrontListingRow = await db.query.storefrontListings.findFirst({
    where: (sl, ops) =>
      ops.and(
        ops.eq(sl.userId, user.id),
        ops.eq(sl.catalogItemId, numericId)
      ),
  });
  const storefrontListingDto = storefrontListingRow
    ? {
        askingPriceCents: storefrontListingRow.askingPriceCents,
        updatedAt: storefrontListingRow.updatedAt.toISOString(),
      }
    : null;

  const initial: HoldingDetailDto = {
    item: {
      id: item.id,
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      setName: item.setName,
      setCode: item.setCode,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
      msrpCents: item.msrpCents,
      packCount: item.packCount,
    },
    holding: holding ?? {
      catalogItemId: item.id,
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
      qtyHeld: 0,
      qtyHeldTracked: 0,
      qtyHeldCollection: 0,
      totalInvestedCents: 0,
      currentValueCents: null,
      currentValueTrackedCents: null,
      currentValueCollectionCents: null,
      pnlCents: null,
      pnlPct: null,
      priced: false,
      stale: false,
    },
    lots: lots.map((l) => {
      const sourceRip = l.sourceRipId != null ? ripById.get(l.sourceRipId) ?? null : null;
      const sourcePackPurchase = sourceRip
        ? sourcePackByPurchaseId.get(sourceRip.sourcePurchaseId) ?? null
        : null;
      const sourcePackCatalog = sourcePackPurchase
        ? sourcePackCatalogById.get(sourcePackPurchase.catalogItemId) ?? null
        : null;
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
          unknownCost: l.unknownCost,
          createdAt: l.createdAt.toISOString(),
        },
        qtyRemaining,
        sourceRip: sourceRip
          ? { id: sourceRip.id, ripDate: sourceRip.ripDate, sourcePurchaseId: sourceRip.sourcePurchaseId }
          : null,
        sourcePack: sourcePackCatalog
          ? { catalogItemId: sourcePackCatalog.id, name: sourcePackCatalog.name }
          : null,
        sourceDecomposition: decomp
          ? { id: decomp.id, decomposeDate: decomp.decomposeDate, sourcePurchaseId: decomp.sourcePurchaseId }
          : null,
        sourceContainer: containerCatalog
          ? { catalogItemId: containerCatalog.id, name: containerCatalog.name }
          : null,
      };
    }),
    rips: ripsSummary,
    decompositions: decompositionsSummary,
    sales: salesEvents,
    activity,
    storefrontListing: storefrontListingDto,
  };

  return <HoldingDetailClient initial={initial} />;
}
