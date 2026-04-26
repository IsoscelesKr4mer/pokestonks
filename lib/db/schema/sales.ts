import { pgTable, bigserial, uuid, bigint, date, integer, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchases } from './purchases';

export const sales = pgTable(
  'sales',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    purchaseId: bigint('purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    saleDate: date('sale_date').notNull(),
    quantity: integer('quantity').notNull(),
    salePriceCents: integer('sale_price_cents').notNull(),
    feesCents: integer('fees_cents').notNull().default(0),
    matchedCostCents: integer('matched_cost_cents').notNull(),
    platform: text('platform'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('sales_user_date_idx').on(t.userId, t.saleDate),
    quantityCheck: check('sales_quantity_positive', sql`${t.quantity} > 0`),
    feesCheck: check('sales_fees_nonneg', sql`${t.feesCents} >= 0`),
  })
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
