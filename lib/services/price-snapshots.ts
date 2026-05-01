import 'server-only';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { ArchivePriceRow } from './tcgcsv-archive';
import { fetchAllPrices } from './tcgcsv-live';

const POKEMON_CATEGORY_IDS = [3, 50];

export type PersistOptions = {
  source: 'tcgcsv' | 'manual';
  updateLastMarket: boolean;
};

export type PersistResult = {
  rowsWritten: number;
  itemsUpdated: number;       // count of catalog_items where last_market_cents was updated
  itemsSkippedManual: number; // count of items skipped because manual_market_cents was non-null
};

export async function persistSnapshot(
  date: string, // YYYY-MM-DD
  prices: Map<number, ArchivePriceRow>,
  catalogItems: Array<{
    id: number;
    tcgplayerProductId: number | null;
    manualMarketCents: number | null;
  }>,
  options: PersistOptions
): Promise<PersistResult> {
  let rowsWritten = 0;
  let itemsUpdated = 0;
  let itemsSkippedManual = 0;

  const valuesToInsert: Array<typeof schema.marketPrices.$inferInsert> = [];
  const idsToUpdateLastMarket: Array<{ id: number; cents: number }> = [];

  for (const item of catalogItems) {
    if (item.tcgplayerProductId == null) continue;
    const row = prices.get(item.tcgplayerProductId);
    if (!row) continue;

    valuesToInsert.push({
      catalogItemId: item.id,
      snapshotDate: date,
      condition: null,
      marketPriceCents: row.marketPriceCents,
      lowPriceCents: row.lowPriceCents,
      highPriceCents: row.highPriceCents,
      source: options.source,
    });

    if (options.updateLastMarket && row.marketPriceCents != null) {
      if (item.manualMarketCents != null) {
        itemsSkippedManual++;
      } else {
        idsToUpdateLastMarket.push({ id: item.id, cents: row.marketPriceCents });
      }
    }
  }

  if (valuesToInsert.length > 0) {
    const inserted = await db
      .insert(schema.marketPrices)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [
          schema.marketPrices.catalogItemId,
          schema.marketPrices.snapshotDate,
          schema.marketPrices.condition,
          schema.marketPrices.source,
        ],
        set: {
          // Use excluded.* so re-runs overwrite with the freshest data, not the old row.
          marketPriceCents: sql`excluded.market_price_cents`,
          lowPriceCents: sql`excluded.low_price_cents`,
          highPriceCents: sql`excluded.high_price_cents`,
        },
      })
      .returning({ id: schema.marketPrices.id });
    rowsWritten = inserted.length;
  }

  for (const { id, cents } of idsToUpdateLastMarket) {
    await db
      .update(schema.catalogItems)
      .set({ lastMarketCents: cents, lastMarketAt: new Date() })
      .where(and(eq(schema.catalogItems.id, id), isNull(schema.catalogItems.manualMarketCents)));
    itemsUpdated++;
  }

  return { rowsWritten, itemsUpdated, itemsSkippedManual };
}

export type SnapshotResult = PersistResult & { date: string };

// Convenience: fetch today's prices via tcgcsv-live, look up catalog items, persist.
// Used by the daily cron (all catalog ids) and refresh-held (held ids only).
export async function snapshotForItems(catalogItemIds: number[]): Promise<SnapshotResult> {
  const todayUtc = new Date().toISOString().slice(0, 10);

  if (catalogItemIds.length === 0) {
    return { rowsWritten: 0, itemsUpdated: 0, itemsSkippedManual: 0, date: todayUtc };
  }

  const fetchResult = await fetchAllPrices(POKEMON_CATEGORY_IDS);

  const items = await db.query.catalogItems.findMany({
    where: inArray(schema.catalogItems.id, catalogItemIds),
    columns: { id: true, tcgplayerProductId: true, manualMarketCents: true },
  });

  const result = await persistSnapshot(todayUtc, fetchResult.prices, items, {
    source: 'tcgcsv',
    updateLastMarket: true,
  });

  return { ...result, date: todayUtc };
}
