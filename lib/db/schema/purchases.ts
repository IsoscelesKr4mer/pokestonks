import { pgTable, bigserial, uuid, bigint, date, integer, text, boolean, numeric, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';
import { rips } from './rips';

export const purchases = pgTable(
  'purchases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id),
    purchaseDate: date('purchase_date').notNull(),
    quantity: integer('quantity').notNull(),
    costCents: integer('cost_cents').notNull(),
    condition: text('condition'),
    isGraded: boolean('is_graded').notNull().default(false),
    gradingCompany: text('grading_company'),
    grade: numeric('grade', { precision: 3, scale: 1 }),
    certNumber: text('cert_number'),
    source: text('source'),
    location: text('location'),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    sourceRipId: bigint('source_rip_id', { mode: 'number' }).references(() => rips.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCatalogIdx: index('purchases_user_catalog_idx').on(t.userId, t.catalogItemId),
    userCatalogOpenIdx: index('purchases_user_catalog_open_idx')
      .on(t.userId, t.catalogItemId)
      .where(sql`${t.deletedAt} IS NULL`),
    sourceRipIdx: index('purchases_source_rip_idx')
      .on(t.sourceRipId)
      .where(sql`${t.sourceRipId} IS NOT NULL`),
    quantityCheck: check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    costCheck: check('purchases_cost_nonneg', sql`${t.costCents} >= 0`),
  })
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
