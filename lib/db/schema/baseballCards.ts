import {
  pgTable,
  bigserial,
  uuid,
  text,
  integer,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const BASEBALL_CARD_STATUSES = [
  'needs_photos',
  'photographed',
  'priced',
  'listed',
  'sold',
] as const;

export const baseballCards = pgTable(
  'baseball_cards',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    player: text('player').notNull(),
    setName: text('set_name'),
    year: integer('year'),
    cardNumber: text('card_number'),
    parallel: text('parallel'),
    sport: text('sport').notNull().default('Baseball'),
    status: text('status').notNull().default('needs_photos'),
    forSale: boolean('for_sale').notNull().default(true),
    needsBackPhoto: boolean('needs_back_photo').notNull().default(true),
    hiddenFromShare: boolean('hidden_from_share').notNull().default(false),
    askingPriceCents: integer('asking_price_cents'),
    compNote: text('comp_note'),
    photoUrls: jsonb('photo_urls').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    imageStoragePath: text('image_storage_path'),
    ebayItemId: text('ebay_item_id'),
    ebayOfferId: text('ebay_offer_id'),
    ebaySku: text('ebay_sku'),
    soldPriceCents: integer('sold_price_cents'),
    soldDate: date('sold_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('baseball_cards_user_idx').on(t.userId),
    statusIdx: index('baseball_cards_status_idx').on(t.status),
    statusCheck: check(
      'baseball_cards_status_valid',
      sql`${t.status} IN ('needs_photos', 'photographed', 'priced', 'listed', 'sold')`
    ),
    askingPriceCheck: check(
      'baseball_cards_asking_price_nonneg',
      sql`${t.askingPriceCents} IS NULL OR ${t.askingPriceCents} >= 0`
    ),
    soldPriceCheck: check(
      'baseball_cards_sold_price_nonneg',
      sql`${t.soldPriceCents} IS NULL OR ${t.soldPriceCents} >= 0`
    ),
    ownPolicy: pgPolicy('own baseball_cards', {
      for: 'all',
      to: ['authenticated'],
      using: sql`(user_id = auth.uid())`,
      withCheck: sql`(user_id = auth.uid())`,
    }),
  })
);

export type BaseballCard = typeof baseballCards.$inferSelect;
export type NewBaseballCard = typeof baseballCards.$inferInsert;
