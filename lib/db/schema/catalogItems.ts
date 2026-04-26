import { pgTable, bigserial, text, integer, date, timestamp, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    setName: text('set_name'),
    setCode: text('set_code'),
    tcgplayerProductId: bigint('tcgplayer_product_id', { mode: 'number' }).unique(),
    productType: text('product_type'),
    msrpCents: integer('msrp_cents'),
    pokemonTcgCardId: text('pokemon_tcg_card_id'),
    tcgplayerSkuId: bigint('tcgplayer_sku_id', { mode: 'number' }),
    cardNumber: text('card_number'),
    rarity: text('rarity'),
    variant: text('variant'),
    imageUrl: text('image_url'),
    imageStoragePath: text('image_storage_path'),
    releaseDate: date('release_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindSetCodeIdx: index('catalog_items_kind_set_code_idx').on(t.kind, t.setCode),
    nameSearchIdx: index('catalog_items_name_search_idx').using('gin', sql`to_tsvector('english', ${t.name})`),
    cardNumberIdx: index('catalog_items_card_number_idx').on(t.cardNumber).where(sql`${t.kind} = 'card'`),
    cardUniqueIdx: uniqueIndex('catalog_items_card_unique_idx')
      .on(t.setCode, t.cardNumber, t.variant)
      .where(sql`${t.kind} = 'card'`),
  })
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
