import { pgTable, bigserial, bigint, integer, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';

export const catalogPackCompositions = pgTable(
  'catalog_pack_compositions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceCatalogItemId: bigint('source_catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    contentsCatalogItemId: bigint('contents_catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceContentsIdx: uniqueIndex('catalog_pack_compositions_source_contents_idx').on(
      t.sourceCatalogItemId,
      t.contentsCatalogItemId
    ),
    sourceIdx: index('catalog_pack_compositions_source_idx').on(
      t.sourceCatalogItemId,
      t.displayOrder
    ),
    qtyCheck: check('catalog_pack_compositions_qty_positive', sql`${t.quantity} > 0`),
  })
);

export type CatalogPackComposition = typeof catalogPackCompositions.$inferSelect;
export type NewCatalogPackComposition = typeof catalogPackCompositions.$inferInsert;
