import {
  pgTable,
  bigserial,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Per-user eBay OAuth credentials. Refresh token has ~18-month lifetime;
 * access token expires in ~2 hours and is refreshed lazily before each API call.
 */
export const ebayCredentials = pgTable('ebay_credentials', {
  userId: uuid('user_id').primaryKey(),
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
  }),
  ebayUserId: text('ebay_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Maps an eBay listing item_id to the pokestonks catalog items it contains.
 * One eBay listing can map to multiple pokestonks SKUs (bundle listings),
 * stored as a JSON array of { catalogItemId, qty }.
 */
export const ebayListingMappings = pgTable(
  'ebay_listing_mappings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    ebayItemId: text('ebay_item_id').notNull(),
    mappings: jsonb('mappings').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userItemUnique: unique('ebay_listing_mappings_user_item_unique').on(
      t.userId,
      t.ebayItemId
    ),
    userItemIdx: index('ebay_listing_mappings_user_item_idx').on(
      t.userId,
      t.ebayItemId
    ),
  })
);

/**
 * Tracks which eBay orders have been synced into pokestonks. Used for
 * idempotent dedup on each sync run. Stores the sale_group_id created
 * (or NULL if the user skipped the order).
 */
export const ebaySyncedOrders = pgTable(
  'ebay_synced_orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    ebayOrderId: text('ebay_order_id').notNull(),
    saleGroupId: uuid('sale_group_id'),
    skipped: boolean('skipped').notNull().default(false),
    syncedAt: timestamp('synced_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userOrderUnique: unique('ebay_synced_orders_user_order_unique').on(
      t.userId,
      t.ebayOrderId
    ),
    userIdx: index('ebay_synced_orders_user_idx').on(t.userId),
  })
);

/**
 * Per-user high-water mark for syncs. `last_synced_at` is the timestamp
 * filter used for the next eBay Fulfillment API call. Set initially to
 * the moment of OAuth connection so historical sales are not re-imported.
 */
export const ebaySyncState = pgTable('ebay_sync_state', {
  userId: uuid('user_id').primaryKey(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type EbayCredential = typeof ebayCredentials.$inferSelect;
export type NewEbayCredential = typeof ebayCredentials.$inferInsert;
export type EbayListingMapping = typeof ebayListingMappings.$inferSelect;
export type NewEbayListingMapping = typeof ebayListingMappings.$inferInsert;
export type EbaySyncedOrder = typeof ebaySyncedOrders.$inferSelect;
export type NewEbaySyncedOrder = typeof ebaySyncedOrders.$inferInsert;
export type EbaySyncState = typeof ebaySyncState.$inferSelect;
export type NewEbaySyncState = typeof ebaySyncState.$inferInsert;

/**
 * Shape of the `mappings` JSON column on `ebay_listing_mappings`.
 * One eBay listing maps to N pokestonks catalog items with quantities.
 */
export type EbayMappingEntry = {
  catalogItemId: number;
  qty: number;
};
