import { pgTable, bigserial, bigint, date, integer, text, unique, index, timestamp } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalogItems';

export const marketPrices = pgTable(
  'market_prices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    condition: text('condition'),
    marketPriceCents: integer('market_price_cents'),
    lowPriceCents: integer('low_price_cents'),
    highPriceCents: integer('high_price_cents'),
    source: text('source').notNull().default('tcgcsv'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqSnapshot: unique('market_prices_uniq_snapshot').on(
      t.catalogItemId,
      t.snapshotDate,
      t.condition,
      t.source
    ),
    catalogDateIdx: index('market_prices_catalog_date_idx').on(t.catalogItemId, t.snapshotDate),
    catalogDateDescIdx: index('market_prices_catalog_date_desc_idx').on(
      t.catalogItemId,
      t.snapshotDate.desc()
    ),
  })
);

export type MarketPrice = typeof marketPrices.$inferSelect;
export type NewMarketPrice = typeof marketPrices.$inferInsert;
