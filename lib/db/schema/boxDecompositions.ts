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

export const boxDecompositions = pgTable(
  'box_decompositions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    decomposeDate: date('decompose_date').notNull(),
    sourceCostCents: integer('source_cost_cents').notNull(),
    packCount: integer('pack_count').notNull(),
    perPackCostCents: integer('per_pack_cost_cents').notNull(),
    roundingResidualCents: integer('rounding_residual_cents').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('box_decompositions_user_date_idx').on(t.userId, t.decomposeDate),
    sourcePurchaseIdx: index('box_decompositions_source_purchase_idx').on(t.sourcePurchaseId),
    sourceCostCheck: check('box_decompositions_source_cost_nonneg', sql`${t.sourceCostCents} >= 0`),
    packCountCheck: check('box_decompositions_pack_count_positive', sql`${t.packCount} > 0`),
    perPackCheck: check('box_decompositions_per_pack_nonneg', sql`${t.perPackCostCents} >= 0`),
  })
);

export type BoxDecomposition = typeof boxDecompositions.$inferSelect;
export type NewBoxDecomposition = typeof boxDecompositions.$inferInsert;
