import { notFound, redirect } from 'next/navigation';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { HoldingDetailClient } from './HoldingDetailClient';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
} from '@/lib/services/holdings';
import type { HoldingDetailDto } from '@/lib/query/hooks/useHoldings';

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

  // Rollup.
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
  const rawDecompositions: RawDecompositionRow[] = decompositionsForSealed.map((d) => ({
    id: d.id,
    source_purchase_id: d.sourcePurchaseId,
  }));
  const [holding] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);

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
      qtyHeld: 0,
      totalInvestedCents: 0,
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
          createdAt: l.createdAt.toISOString(),
        },
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
    rips:
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
        : [],
    decompositions:
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
        : [],
  };

  const isCard = item.kind === 'card';

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div
          className={
            isCard
              ? 'aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted'
              : 'aspect-square w-full overflow-hidden rounded-lg bg-muted'
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={initial.item.imageUrl ?? ''} alt={item.name} className="size-full object-contain" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          {item.setName && <p className="text-sm text-muted-foreground">{item.setName}</p>}
          <p className="text-sm text-muted-foreground">
            {isCard
              ? [item.rarity, item.cardNumber, item.variant].filter(Boolean).join(' · ')
              : item.productType ?? 'Sealed'}
          </p>
          {item.lastMarketCents != null && (
            <p className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
              Latest market price
            </p>
          )}
          {item.lastMarketCents != null && (
            <p className="text-2xl font-semibold tabular-nums">
              ${(item.lastMarketCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>

      <HoldingDetailClient catalogItemId={numericId} initial={initial} />
    </div>
  );
}
