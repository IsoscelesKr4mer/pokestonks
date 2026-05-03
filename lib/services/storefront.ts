import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { CatalogItem } from '@/lib/db/schema/catalogItems';

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

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
  askingPriceCents: number | null;
  updatedAt: Date;
};

export type StorefrontViewSummary = {
  items: StorefrontViewItem[];
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

/**
 * Load the storefront view for a given user. Joins catalog_items with
 * storefront_listings and the user's purchases (excluding soft-deleted
 * + graded lots), then filters out zero-qty rows.
 *
 * Returns items sorted by listing.updated_at DESC, name ASC.
 */
export async function loadStorefrontView(userId: string): Promise<StorefrontViewSummary> {
  // Step 1: load all listings for user.
  const listings = await db.query.storefrontListings.findMany({
    where: eq(schema.storefrontListings.userId, userId),
  });
  if (listings.length === 0) {
    return { items: [], itemsCount: 0, lastUpdatedAt: null };
  }

  const catalogIds = listings.map((l) => l.catalogItemId);

  // Step 2: load catalog rows for those ids.
  const catalogRows = await db.query.catalogItems.findMany({
    where: (ci, ops) => ops.inArray(ci.id, catalogIds),
  });
  const catalogById = new Map<number, CatalogItem>(catalogRows.map((c) => [c.id, c]));

  // Step 3: load this user's open purchase lots for those catalog ids.
  const lots = await db.query.purchases.findMany({
    where: (p, ops) =>
      ops.and(
        ops.eq(p.userId, userId),
        ops.inArray(p.catalogItemId, catalogIds),
        ops.isNull(p.deletedAt)
      ),
  });

  // Step 4: load consumption events to compute qty remaining per lot.
  const lotIds = lots.map((l) => l.id);
  const [rips, decompositions, sales] = await Promise.all([
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ sourcePurchaseId: number }>)
      : db.query.rips.findMany({
          where: (r, ops) => ops.inArray(r.sourcePurchaseId, lotIds),
        }),
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ sourcePurchaseId: number }>)
      : db.query.boxDecompositions.findMany({
          where: (d, ops) => ops.inArray(d.sourcePurchaseId, lotIds),
        }),
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ purchaseId: number; quantity: number }>)
      : db.query.sales.findMany({
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

  // Step 5: aggregate per catalog item, raw (non-graded) only.
  const aggByCatalog = new Map<
    number,
    { qtyRaw: number; lotsForLabel: TypeLabelLot[] }
  >();
  for (const lot of lots) {
    const remaining = lot.quantity - (consumed.get(lot.id) ?? 0);
    if (remaining <= 0) continue;
    if (lot.isGraded) continue; // graded excluded from storefront
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

  // Step 6: build items array, filtered by qtyRaw > 0.
  const items: StorefrontViewItem[] = [];
  for (const listing of listings) {
    const agg = aggByCatalog.get(listing.catalogItemId);
    if (!agg || agg.qtyRaw <= 0) continue;
    const item = catalogById.get(listing.catalogItemId);
    if (!item) continue;
    items.push({
      catalogItemId: listing.catalogItemId,
      name: item.name,
      setName: item.setName,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      typeLabel: computeTypeLabel(
        { kind: item.kind as 'sealed' | 'card', productType: item.productType },
        agg.lotsForLabel
      ),
      qtyAvailable: agg.qtyRaw,
      askingPriceCents: listing.askingPriceCents,
      updatedAt: listing.updatedAt,
    });
  }

  // Step 7: sort by updated_at DESC, name ASC tiebreaker.
  items.sort((a, b) => {
    const t = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (t !== 0) return t;
    return a.name.localeCompare(b.name);
  });

  const lastUpdatedAt =
    items.length === 0 ? null : items.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), items[0].updatedAt);

  return { items, itemsCount: items.length, lastUpdatedAt };
}
