import 'server-only';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

/**
 * Generate a 16-character URL-safe random token (96 bits of entropy).
 * Caller should retry once on unique-index conflict.
 */
export function generateShareToken(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Look up an active share token by its public string. Returns null when:
 *  - the token row does not exist
 *  - the token row is revoked (revoked_at is not null)
 *  - the token's kind does not match the expected discriminator
 *
 * This is the public-route resolver. It uses the direct-Postgres Drizzle
 * client (lib/db/client.ts), which is not subject to PostgREST RLS — that
 * is the deliberate service-role bypass for the public /storefront route.
 */
export async function resolveShareToken(
  token: string,
  kind: 'storefront'
): Promise<ShareToken | null> {
  const row = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.token, token),
  });
  if (!row) return null;
  if (row.revokedAt != null) return null;
  if (row.kind !== kind) return null;
  return row;
}
