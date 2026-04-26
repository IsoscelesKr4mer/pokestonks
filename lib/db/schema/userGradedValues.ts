import { pgTable, bigserial, uuid, bigint, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalogItems';

export const userGradedValues = pgTable(
  'user_graded_values',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id),
    gradingCompany: text('grading_company').notNull(),
    grade: numeric('grade', { precision: 3, scale: 1 }).notNull(),
    valueCents: integer('value_cents').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
    notes: text('notes'),
  },
  (t) => ({
    lookupIdx: index('user_graded_values_lookup_idx').on(
      t.userId,
      t.catalogItemId,
      t.gradingCompany,
      t.grade,
      t.recordedAt
    ),
  })
);

export type UserGradedValue = typeof userGradedValues.$inferSelect;
export type NewUserGradedValue = typeof userGradedValues.$inferInsert;
