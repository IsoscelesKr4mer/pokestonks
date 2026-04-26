import 'server-only';
import { db, schema } from '@/lib/db/client';
import { and, desc, eq, gte } from 'drizzle-orm';
import { fetchSinglePrice, getGroups } from './tcgcsv';

const FRESH_WINDOW_HOURS = 24;
const STALE_THRESHOLD_DAYS = 7;

export type LatestPrice = {
  marketCents: number | null;
  snapshotDate: string;
  source: 'tcgcsv';
  isStale: boolean;
};

export async function getOrRefreshLatestPrice(item: {
  id: number;
  kind: string;
  setCode: string | null;
  cardNumber: string | null;
  tcgplayerProductId: number | null;
}): Promise<LatestPrice | null> {
  const cutoff = new Date(Date.now() - FRESH_WINDOW_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const fresh = await db.query.marketPrices.findFirst({
    where: and(eq(schema.marketPrices.catalogItemId, item.id), gte(schema.marketPrices.snapshotDate, cutoff)),
    orderBy: [desc(schema.marketPrices.snapshotDate)],
  });
  if (fresh) {
    return {
      marketCents: fresh.marketPriceCents,
      snapshotDate: fresh.snapshotDate,
      source: 'tcgcsv',
      isStale: ageDays(fresh.snapshotDate) > STALE_THRESHOLD_DAYS,
    };
  }

  // Refresh: only sealed (productId-keyed) on-demand for v1; cards depend on group lookup which is heavier.
  if (item.kind !== 'sealed' || !item.tcgplayerProductId) {
    const last = await db.query.marketPrices.findFirst({
      where: eq(schema.marketPrices.catalogItemId, item.id),
      orderBy: [desc(schema.marketPrices.snapshotDate)],
    });
    return last
      ? {
          marketCents: last.marketPriceCents,
          snapshotDate: last.snapshotDate,
          source: 'tcgcsv',
          isStale: ageDays(last.snapshotDate) > STALE_THRESHOLD_DAYS,
        }
      : null;
  }

  // Sealed on-demand.
  const groups = await getGroups();
  const group = item.setCode
    ? groups.find((g) => (g.abbreviation ?? '').toLowerCase() === item.setCode)
    : null;
  if (!group) return null;
  try {
    const price = await fetchSinglePrice({ groupId: group.groupId, productId: item.tcgplayerProductId });
    if (!price) return null;
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.marketPrices)
      .values({
        catalogItemId: item.id,
        snapshotDate: today,
        condition: null,
        marketPriceCents: price.marketCents,
        lowPriceCents: price.lowCents,
        highPriceCents: price.highCents,
        source: 'tcgcsv',
      })
      .onConflictDoNothing();
    return { marketCents: price.marketCents, snapshotDate: today, source: 'tcgcsv', isStale: false };
  } catch (err) {
    console.error('[prices.getOrRefresh] failed', err);
    return null;
  }
}

function ageDays(snapshotDate: string): number {
  const ms = Date.now() - Date.parse(`${snapshotDate}T00:00:00Z`);
  return ms / (24 * 60 * 60 * 1000);
}
