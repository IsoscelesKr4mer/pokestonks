import 'server-only';
import { NextResponse } from 'next/server';
import { eq, asc, isNull, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { generateShareToken } from '@/lib/services/share-tokens';
import { createTokenInputSchema } from '@/lib/validation/storefront';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

export type ShareTokenDto = {
  id: number;
  token: string;
  label: string;
  kind: 'storefront';
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
  createdAt: string;
  revokedAt: string | null;
};

function toDto(row: ShareToken): ShareTokenDto {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    kind: row.kind as 'storefront',
    headerTitle: row.headerTitle,
    headerSubtitle: row.headerSubtitle,
    contactLine: row.contactLine,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db.query.shareTokens.findMany({
    where: eq(schema.shareTokens.userId, user.id),
    orderBy: [asc(schema.shareTokens.revokedAt), desc(schema.shareTokens.createdAt)],
  });

  // Drizzle puts NULL values *first* with asc — flip order so active (NULL revokedAt) come first.
  const active = rows.filter((r) => r.revokedAt == null);
  const revoked = rows.filter((r) => r.revokedAt != null);
  return NextResponse.json({
    tokens: [...active, ...revoked].map(toDto),
  });
}

export async function POST(req: Request) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = createTokenInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // One retry on unique-index conflict.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateShareToken();
    try {
      const [row] = await db
        .insert(schema.shareTokens)
        .values({
          token,
          userId: user.id,
          kind: 'storefront',
          label: v.label ?? '',
          headerTitle: v.headerTitle ?? null,
          headerSubtitle: v.headerSubtitle ?? null,
          contactLine: v.contactLine ?? null,
        })
        .returning();
      return NextResponse.json({ token: toDto(row) }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (attempt === 0 && /share_tokens_token_(key|unique)/.test(message)) {
        continue; // collision, retry once
      }
      return NextResponse.json(
        { error: 'create_failed', message: message || 'unknown' },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ error: 'token_collision' }, { status: 500 });
}
