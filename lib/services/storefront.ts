import 'server-only';
import { db } from '@/lib/db/client';
import type { CatalogItem } from '@/lib/db/schema/catalogItems';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Round cents up to the nearest step (default $5 = 500 cents). Used for
 * the auto-priced storefront fallback so a $54.99 ETB shows as $55, a
 * $159.99 box shows as $160, etc.
 */
export function roundUpToNearest(cents: number, step: number = 500): number {
  if (cents <= 0) return 0;
  return Math.ceil(cents / step) * step;
}

type TypeLabelItem = {
  kind: 'sealed' | 'card';
  productType: string | null;
};

type TypeLabelLot = {
  quantity: number;
  condition: string | null;
  isGraded: boolean;
};

/**
 * Compute the buyer-facing type label for a holding.
 *
 * Sealed: returns the catalog productType verbatim, falling back to
 *   "Sealed" if productType is null.
 *
 * Card: returns "Card · {majority_condition}" computed across non-graded
 *   lots by qty, "Card · Mixed" when conditions tie for the most qty, or
 *   bare "Card" when there are no non-graded lots OR no condition is set
 *   on any non-graded lot.
 *
 * Graded lots are intentionally excluded from card-condition reasoning
 * because graded items are not eligible for the storefront in v1.
 */
export function computeTypeLabel(item: TypeLabelItem, lots: TypeLabelLot[]): string {
  if (item.kind === 'sealed') {
    return item.productType ?? 'Sealed';
  }
  // Card path
  const rawLots = lots.filter((l) => !l.isGraded && l.condition != null);
  if (rawLots.length === 0) return 'Card';

  const totals = new Map<string, number>();
  for (const l of rawLots) {
    const c = l.condition!;
    totals.set(c, (totals.get(c) ?? 0) + l.quantity);
  }

  let topQty = -1;
  let topConditions: string[] = [];
  for (const [cond, qty] of totals) {
    if (qty > topQty) {
      topQty = qty;
      topConditions = [cond];
    } else if (qty === topQty) {
      topConditions.push(cond);
    }
  }

  if (topConditions.length !== 1) return 'Card · Mixed';
  return `Card · ${topConditions[0]}`;
}

// ---------------------------------------------------------------------------
// Admin view loader (all eligible holdings + override metadata)
// ---------------------------------------------------------------------------

export type StorefrontAdminItem = {
  catalogItemId: number;
  /** The override row if one exists (NULL means no override). */
  override: {
    askingPriceCents: number | null;
    hidden: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  /** Display price for the buyer if not hidden -- the override-or-rounded-market chain. NULL when no source available, OR when the item is hidden (admin display still shows the would-be-render via priceOrigin). */
  displayPriceCents: number | null;
  /** Which source produced displayPriceCents (or, if hidden, what would have). */
  priceOrigin: 'manual' | 'auto' | 'none';
  item: {
    id: number;
    name: string;
    setName: string | null;
    kind: 'sealed' | 'card';
    productType: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    lastMarketAt: Date | null;
  };
  qtyHeldRaw: number;
  typeLabel: string;
};

export async function loadStorefrontAdminView(userId: string): Promise<StorefrontAdminItem[]> {
  const lots = await db.query.purchases.findMany({
    where: (p, ops) =>
      ops.and(ops.eq(p.userId, userId), ops.isNull(p.deletedAt)),
  });
  if (lots.length === 0) return [];
  const lotIds = lots.map((l) => l.id);

  const [rips, decompositions, sales] = await Promise.all([
    db.query.rips.findMany({ where: (r, ops) => ops.inArray(r.sourcePurchaseId, lotIds) }),
    db.query.boxDecompositions.findMany({ where: (d, ops) => ops.inArray(d.sourcePurchaseId, lotIds) }),
    db.query.sales.findMany({ where: (s, ops) => ops.inArray(s.purchaseId, lotIds) }),
  ]);

  const consumed = new Map<number, number>();
  for (const r of rips) consumed.set(r.sourcePurchaseId, (consumed.get(r.sourcePurchaseId) ?? 0) + 1);
  for (const d of decompositions) consumed.set(d.sourcePurchaseId, (consumed.get(d.sourcePurchaseId) ?? 0) + 1);
  for (const s of sales) consumed.set(s.purchaseId, (consumed.get(s.purchaseId) ?? 0) + s.quantity);

  const aggByCatalog = new Map<number, { qtyRaw: number; lotsForLabel: TypeLabelLot[] }>();
  for (const lot of lots) {
    const remaining = lot.quantity - (consumed.get(lot.id) ?? 0);
    if (remaining <= 0) continue;
    if (lot.isGraded) continue;
    const acc = aggByCatalog.get(lot.catalogItemId) ?? { qtyRaw: 0, lotsForLabel: [] };
    acc.qtyRaw += remaining;
    acc.lotsForLabel.push({
      quantity: remaining,
      condition: lot.condition,
      isGraded: lot.isGraded,
    });
    aggByCatalog.set(lot.catalogItemId, acc);
  }
  if (aggByCatalog.size === 0) return [];

  const eligibleIds = Array.from(aggByCatalog.keys());
  const [catalogRows, overrides] = await Promise.all([
    db.query.catalogItems.findMany({ where: (ci, ops) => ops.inArray(ci.id, eligibleIds) }),
    db.query.storefrontListings.findMany({
      where: (sl, ops) => ops.and(ops.eq(sl.userId, userId), ops.inArray(sl.catalogItemId, eligibleIds)),
    }),
  ]);
  const catalogById = new Map<number, CatalogItem>(catalogRows.map((c) => [c.id, c]));
  const overrideByCatalog = new Map(overrides.map((o) => [o.catalogItemId, o]));

  const items: StorefrontAdminItem[] = [];
  for (const [catalogItemId, agg] of aggByCatalog) {
    const item = catalogById.get(catalogItemId);
    if (!item) continue;
    const override = overrideByCatalog.get(catalogItemId);

    let priceOrigin: 'manual' | 'auto' | 'none';
    let displayPriceCents: number | null;
    if (override?.askingPriceCents != null) {
      priceOrigin = 'manual';
      displayPriceCents = override.askingPriceCents;
    } else if (item.lastMarketCents != null) {
      priceOrigin = 'auto';
      displayPriceCents = roundUpToNearest(item.lastMarketCents);
    } else {
      priceOrigin = 'none';
      displayPriceCents = null;
    }
    if (override?.hidden) {
      // Admin still shows the row, but display price = null to communicate "not visible to buyer"
      displayPriceCents = null;
    }

    items.push({
      catalogItemId,
      override: override
        ? {
            askingPriceCents: override.askingPriceCents,
            hidden: override.hidden,
            createdAt: override.createdAt,
            updatedAt: override.updatedAt,
          }
        : null,
      displayPriceCents,
      priceOrigin,
      item: {
        id: item.id,
        name: item.name,
        setName: item.setName,
        kind: item.kind as 'sealed' | 'card',
        productType: item.productType,
        imageUrl: item.imageUrl,
        imageStoragePath: item.imageStoragePath,
        lastMarketCents: item.lastMarketCents,
        lastMarketAt: item.lastMarketAt,
      },
      qtyHeldRaw: agg.qtyRaw,
      typeLabel: computeTypeLabel(
        { kind: item.kind as 'sealed' | 'card', productType: item.productType },
        agg.lotsForLabel
      ),
    });
  }

  // Sort: visible+manual first (override.updatedAt DESC), visible+auto next (name ASC), hidden last (name ASC).
  items.sort((a, b) => {
    const aHidden = !!a.override?.hidden;
    const bHidden = !!b.override?.hidden;
    if (aHidden !== bHidden) return aHidden ? 1 : -1;
    if (!aHidden) {
      const aManual = a.priceOrigin === 'manual';
      const bManual = b.priceOrigin === 'manual';
      if (aManual !== bManual) return aManual ? -1 : 1;
      if (aManual) {
        const at = a.override?.updatedAt.getTime() ?? 0;
        const bt = b.override?.updatedAt.getTime() ?? 0;
        if (at !== bt) return bt - at;
      }
    }
    return a.item.name.localeCompare(b.item.name);
  });

  return items;
}

// ---------------------------------------------------------------------------
// Public-route view loader
// ---------------------------------------------------------------------------

export type StorefrontViewItem = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  typeLabel: string;
  qtyAvailable: number;
  /** Resolved price shown to the buyer (override if set, else rounded market). Always non-null in this output (filtered out otherwise). */
  displayPriceCents: number;
  priceOrigin: 'manual' | 'auto';
  /** When the listing override (or its absence) was last touched; null if no override row. */
  updatedAt: Date | null;
};

export type StorefrontViewSummary = {
  items: StorefrontViewItem[];
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

/**
 * Load the public-facing storefront view for a user.
 *
 * Holdings-driven (every catalog_item with raw qty > 0) instead of
 * listings-driven. Override rows in storefront_listings can either pin a
 * manual price OR hide an item. Items with no override and no market price
 * are excluded (no price source).
 *
 * Sort: items with manual override first by override.updatedAt DESC, then
 * auto-priced items by name ASC.
 */
export async function loadStorefrontView(userId: string): Promise<StorefrontViewSummary> {
  // Step 1: load every open purchase lot for the user.
  const lots = await db.query.purchases.findMany({
    where: (p, ops) =>
      ops.and(
        ops.eq(p.userId, userId),
        ops.isNull(p.deletedAt)
      ),
  });
  if (lots.length === 0) {
    return { items: [], itemsCount: 0, lastUpdatedAt: null };
  }

  const lotIds = lots.map((l) => l.id);

  // Step 2: consumption events to compute qty remaining.
  const [rips, decompositions, sales] = await Promise.all([
    db.query.rips.findMany({
      where: (r, ops) => ops.inArray(r.sourcePurchaseId, lotIds),
    }),
    db.query.boxDecompositions.findMany({
      where: (d, ops) => ops.inArray(d.sourcePurchaseId, lotIds),
    }),
    db.query.sales.findMany({
      where: (s, ops) => ops.inArray(s.purchaseId, lotIds),
    }),
  ]);

  const consumed = new Map<number, number>();
  for (const r of rips) {
    consumed.set(r.sourcePurchaseId, (consumed.get(r.sourcePurchaseId) ?? 0) + 1);
  }
  for (const d of decompositions) {
    consumed.set(d.sourcePurchaseId, (consumed.get(d.sourcePurchaseId) ?? 0) + 1);
  }
  for (const s of sales) {
    consumed.set(s.purchaseId, (consumed.get(s.purchaseId) ?? 0) + s.quantity);
  }

  // Step 3: aggregate raw (non-graded) qty per catalog item, plus collect
  //         lots for type-label computation.
  const aggByCatalog = new Map<
    number,
    { qtyRaw: number; lotsForLabel: TypeLabelLot[] }
  >();
  for (const lot of lots) {
    const remaining = lot.quantity - (consumed.get(lot.id) ?? 0);
    if (remaining <= 0) continue;
    if (lot.isGraded) continue;
    const acc = aggByCatalog.get(lot.catalogItemId) ?? {
      qtyRaw: 0,
      lotsForLabel: [],
    };
    acc.qtyRaw += remaining;
    acc.lotsForLabel.push({
      quantity: remaining,
      condition: lot.condition,
      isGraded: lot.isGraded,
    });
    aggByCatalog.set(lot.catalogItemId, acc);
  }

  if (aggByCatalog.size === 0) {
    return { items: [], itemsCount: 0, lastUpdatedAt: null };
  }

  // Step 4: load catalog rows + storefront overrides for the eligible ids.
  const eligibleIds = Array.from(aggByCatalog.keys());
  const [catalogRows, overrides] = await Promise.all([
    db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, eligibleIds),
    }),
    db.query.storefrontListings.findMany({
      where: (sl, ops) =>
        ops.and(ops.eq(sl.userId, userId), ops.inArray(sl.catalogItemId, eligibleIds)),
    }),
  ]);
  const catalogById = new Map<number, CatalogItem>(catalogRows.map((c) => [c.id, c]));
  const overrideByCatalog = new Map(overrides.map((o) => [o.catalogItemId, o]));

  // Step 5: assemble. Filter: hidden, or no price source.
  const items: StorefrontViewItem[] = [];
  for (const [catalogItemId, agg] of aggByCatalog) {
    const item = catalogById.get(catalogItemId);
    if (!item) continue;
    const override = overrideByCatalog.get(catalogItemId);

    if (override?.hidden) continue;

    let displayPriceCents: number;
    let priceOrigin: 'manual' | 'auto';
    if (override?.askingPriceCents != null) {
      displayPriceCents = override.askingPriceCents;
      priceOrigin = 'manual';
    } else if (item.lastMarketCents != null) {
      displayPriceCents = roundUpToNearest(item.lastMarketCents);
      priceOrigin = 'auto';
    } else {
      // No price source -- exclude from public storefront.
      continue;
    }

    items.push({
      catalogItemId,
      name: item.name,
      setName: item.setName,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      typeLabel: computeTypeLabel(
        { kind: item.kind as 'sealed' | 'card', productType: item.productType },
        agg.lotsForLabel
      ),
      qtyAvailable: agg.qtyRaw,
      displayPriceCents,
      priceOrigin,
      updatedAt: override?.updatedAt ?? null,
    });
  }

  // Step 6: sort. Manual override first by updatedAt DESC; auto by name ASC.
  // Default sort: alphabetical by name. Buyer can re-sort client-side
  // via the sort dropdown on the public storefront grid.
  items.sort((a, b) => a.name.localeCompare(b.name));

  const lastUpdatedAt = items.reduce<Date | null>((m, i) => {
    if (i.updatedAt == null) return m;
    if (m == null) return i.updatedAt;
    return i.updatedAt > m ? i.updatedAt : m;
  }, null);

  return { items, itemsCount: items.length, lastUpdatedAt };
}
