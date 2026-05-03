import { pgTable, uuid, bigint, integer, boolean, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';

export const storefrontListings = pgTable(
  'storefront_listings',
  {
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    askingPriceCents: integer('asking_price_cents'),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.catalogItemId] }),
    userIdx: index('storefront_listings_user_idx').on(t.userId),
    askingPriceCheck: check(
      'storefront_listings_asking_price_nonneg',
      sql`${t.askingPriceCents} IS NULL OR ${t.askingPriceCents} >= 0`
    ),
  })
);

export type StorefrontListing = typeof storefrontListings.$inferSelect;
export type NewStorefrontListing = typeof storefrontListings.$inferInsert;
