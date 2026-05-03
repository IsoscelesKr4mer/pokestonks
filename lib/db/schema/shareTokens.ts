import { pgTable, bigserial, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const shareTokens = pgTable(
  'share_tokens',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    token: text('token').notNull().unique(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    label: text('label').notNull().default(''),
    headerTitle: text('header_title'),
    headerSubtitle: text('header_subtitle'),
    contactLine: text('contact_line'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('share_tokens_user_idx').on(t.userId, t.revokedAt),
    kindCheck: check('share_tokens_kind_check', sql`${t.kind} IN ('storefront')`),
  })
);

export type ShareToken = typeof shareTokens.$inferSelect;
export type NewShareToken = typeof shareTokens.$inferInsert;
