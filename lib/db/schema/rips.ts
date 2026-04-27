import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  date,
  integer,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchases } from './purchases';

export const rips = pgTable(
  'rips',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    ripDate: date('rip_date').notNull(),
    packCostCents: integer('pack_cost_cents').notNull(),
    realizedLossCents: integer('realized_loss_cents').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('rips_user_date_idx').on(t.userId, t.ripDate),
    sourcePurchaseIdx: index('rips_source_purchase_idx').on(t.sourcePurchaseId),
    packCostCheck: check('rips_pack_cost_nonneg', sql`${t.packCostCents} >= 0`),
  })
);

export type Rip = typeof rips.$inferSelect;
export type NewRip = typeof rips.$inferInsert;
