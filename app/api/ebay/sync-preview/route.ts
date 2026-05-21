import { NextResponse } from 'next/server';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import {
  getOrdersSince,
  getLastSyncedAt,
  type EbayOrder,
} from '@/lib/services/ebay';
import type { EbayMappingEntry } from '@/lib/db/schema/ebay';

type ProposedSaleItem = {
  catalogItemId: number;
  catalogName: string | null;
  quantity: number;
  salePriceCents: number;
  feesCents: number;
};

type PreviewLineItem = {
  ebayItemId: string;
  title: string;
  quantity: number;
  lineRevenueCents: number;
  mapped: boolean;
};

type PreviewOrder = {
  ebayOrderId: string;
  saleDate: string;
  buyerUsername: string | null;
  subtotalCents: number;
  shippingCents: number;
  feesCents: number;
  netRevenueCents: number;
  lineItems: PreviewLineItem[];
  proposedItems: ProposedSaleItem[];
  isFullyMapped: boolean;
  alreadySynced: boolean;
};

function dollarsToCents(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * GET /api/ebay/sync-preview — fetches new orders from eBay since the user's
 * last_synced_at, joins them against existing listing mappings + market
 * prices, and returns a preview the UI can render. Per-row revenue/fees
 * allocations are proposed (proportional to qty × market price); the user
 * can edit in the UI before confirming.
 *
 * This endpoint is read-only — no DB writes occur until /sync-confirm.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const lastSyncedAt = await getLastSyncedAt(user.id);

  let orders: EbayOrder[];
  try {
    orders = await getOrdersSince(user.id, lastSyncedAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'eBay fetch failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (orders.length === 0) {
    return NextResponse.json({
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      orders: [],
      unmappedEbayItemIds: [],
    });
  }

  // Filter to PAID orders only — eBay returns offers/auctions in progress too,
  // and we only want to log sales that actually completed.
  const candidates = orders.filter(
    (o) => o.orderFulfillmentStatus !== 'NOT_STARTED' || isPaid(o)
  );

  const allEbayItemIds = new Set<string>();
  for (const o of candidates) {
    for (const li of o.lineItems) allEbayItemIds.add(li.legacyItemId);
  }

  const mappings = await db
    .select()
    .from(schema.ebayListingMappings)
    .where(
      and(
        eq(schema.ebayListingMappings.userId, user.id),
        inArray(
          schema.ebayListingMappings.ebayItemId,
          Array.from(allEbayItemIds)
        )
      )
    );
  const mappingByEbayItem = new Map(
    mappings.map((m) => [m.ebayItemId, m.mappings as EbayMappingEntry[]])
  );

  const allMappedCatalogIds = new Set<number>();
  for (const entries of mappingByEbayItem.values()) {
    for (const e of entries) allMappedCatalogIds.add(e.catalogItemId);
  }

  // Latest market price per mapped catalog item (for revenue allocation).
  const priceByCatalog = new Map<number, number>();
  const catalogNameById = new Map<number, string>();
  if (allMappedCatalogIds.size > 0) {
    const ids = Array.from(allMappedCatalogIds);
    const catalogRows = await db
      .select()
      .from(schema.catalogItems)
      .where(inArray(schema.catalogItems.id, ids));
    for (const c of catalogRows) catalogNameById.set(c.id, c.name);

    const priceRows = await db
      .select()
      .from(schema.marketPrices)
      .where(inArray(schema.marketPrices.catalogItemId, ids))
      .orderBy(desc(schema.marketPrices.snapshotDate));
    for (const p of priceRows) {
      if (!priceByCatalog.has(p.catalogItemId) && p.marketPriceCents != null) {
        priceByCatalog.set(p.catalogItemId, p.marketPriceCents);
      }
    }
  }

  // Dedup against already-synced orders.
  const candidateOrderIds = candidates.map((o) => o.orderId);
  const syncedRows = candidateOrderIds.length
    ? await db
        .select()
        .from(schema.ebaySyncedOrders)
        .where(
          and(
            eq(schema.ebaySyncedOrders.userId, user.id),
            inArray(schema.ebaySyncedOrders.ebayOrderId, candidateOrderIds)
          )
        )
    : [];
  const alreadySynced = new Set(syncedRows.map((r) => r.ebayOrderId));

  const unmappedSet = new Set<string>();
  const previewOrders: PreviewOrder[] = [];

  for (const o of candidates) {
    const subtotalCents = dollarsToCents(o.pricingSummary.priceSubtotal?.value);
    const shippingCents = dollarsToCents(o.pricingSummary.deliveryCost?.value);
    const feesCents = dollarsToCents(
      o.totalMarketplaceFee?.value ?? o.pricingSummary.fee?.value
    );
    const netRevenueCents = subtotalCents + shippingCents - feesCents;

    const lineItems: PreviewLineItem[] = [];
    const perCatalog = new Map<
      number,
      { qty: number; revenueCents: number; weight: number }
    >();
    let totalWeight = 0;

    for (const li of o.lineItems) {
      const mapping = mappingByEbayItem.get(li.legacyItemId);
      const lineRevenueCents = dollarsToCents(li.total?.value);
      lineItems.push({
        ebayItemId: li.legacyItemId,
        title: li.title,
        quantity: li.quantity,
        lineRevenueCents,
        mapped: mapping != null,
      });
      if (!mapping) {
        unmappedSet.add(li.legacyItemId);
        continue;
      }
      // Per-unit map: 1 listing unit → mapping[].catalogItemId × mapping[].qty
      // Buyer bought li.quantity → total = mapping[].qty × li.quantity per catalog
      let lineWeight = 0;
      for (const m of mapping) {
        const px = priceByCatalog.get(m.catalogItemId) ?? 0;
        lineWeight += px * m.qty;
      }
      // Allocate line revenue across this line's mapped catalogs proportional
      // to qty × market_price. Falls back to equal split if no prices known.
      for (const m of mapping) {
        const totalQty = m.qty * li.quantity;
        const px = priceByCatalog.get(m.catalogItemId) ?? 0;
        const weight = lineWeight > 0 ? px * m.qty : m.qty;
        const lineShare =
          lineWeight > 0
            ? (px * m.qty) / lineWeight
            : m.qty /
              mapping.reduce((acc, e) => acc + e.qty, 0);
        const lineRevForCatalog = Math.round(lineRevenueCents * lineShare);
        const existing = perCatalog.get(m.catalogItemId);
        if (existing) {
          existing.qty += totalQty;
          existing.revenueCents += lineRevForCatalog;
          existing.weight += weight * li.quantity;
        } else {
          perCatalog.set(m.catalogItemId, {
            qty: totalQty,
            revenueCents: lineRevForCatalog,
            weight: weight * li.quantity,
          });
        }
        totalWeight += weight * li.quantity;
      }
    }

    // Allocate (fees + shipping passthrough is included in revenue, fees are
    // subtracted) across catalogs in proportion to their revenue share.
    const proposedItems: ProposedSaleItem[] = [];
    let totalRev = 0;
    for (const v of perCatalog.values()) totalRev += v.revenueCents;
    let feesAllocated = 0;
    const catalogIds = Array.from(perCatalog.keys());
    catalogIds.forEach((cid, idx) => {
      const v = perCatalog.get(cid)!;
      const isLast = idx === catalogIds.length - 1;
      // Add shipping into revenue allocation proportionally too.
      const shippingShare =
        totalRev > 0
          ? Math.round((v.revenueCents / totalRev) * shippingCents)
          : 0;
      const rev = v.revenueCents + shippingShare;
      const fee = isLast
        ? feesCents - feesAllocated
        : totalRev > 0
        ? Math.round((v.revenueCents / totalRev) * feesCents)
        : Math.round(feesCents / catalogIds.length);
      feesAllocated += fee;
      proposedItems.push({
        catalogItemId: cid,
        catalogName: catalogNameById.get(cid) ?? null,
        quantity: v.qty,
        salePriceCents: rev,
        feesCents: Math.max(0, fee),
      });
    });

    previewOrders.push({
      ebayOrderId: o.orderId,
      saleDate: isoDate(o.creationDate),
      buyerUsername: o.buyer?.username ?? null,
      subtotalCents,
      shippingCents,
      feesCents,
      netRevenueCents,
      lineItems,
      proposedItems,
      isFullyMapped: lineItems.every((li) => li.mapped),
      alreadySynced: alreadySynced.has(o.orderId),
    });

    void totalWeight; // weight tracked for future audit; not surfaced
  }

  return NextResponse.json({
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    orders: previewOrders,
    unmappedEbayItemIds: Array.from(unmappedSet),
  });
}

function isPaid(o: EbayOrder): boolean {
  // eBay order statuses we treat as "completed": FULFILLED, IN_PROGRESS,
  // and any with a non-zero priceSubtotal. NOT_STARTED with $0 = unpaid offer.
  if (
    o.orderFulfillmentStatus === 'FULFILLED' ||
    o.orderFulfillmentStatus === 'IN_PROGRESS'
  ) {
    return true;
  }
  return dollarsToCents(o.pricingSummary.priceSubtotal?.value) > 0;
}
