import { pgTable, bigserial, timestamp, text, integer, jsonb } from 'drizzle-orm/pg-core';

export const refreshRuns = pgTable('refresh_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  totalItems: integer('total_items'),
  succeeded: integer('succeeded'),
  failed: integer('failed'),
  errorsJson: jsonb('errors_json'),
});

export type RefreshRun = typeof refreshRuns.$inferSelect;
export type NewRefreshRun = typeof refreshRuns.$inferInsert;
