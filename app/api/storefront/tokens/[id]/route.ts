import 'server-only';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { updateTokenInputSchema } from '@/lib/validation/storefront';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

type Ctx = { params: Promise<{ id: string }> };

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

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const tokenId = parseId(id);
  if (tokenId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = updateTokenInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const existing = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.id, tokenId),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.userId !== user.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const updates: Partial<typeof schema.shareTokens.$inferInsert> = {};
  if (v.label !== undefined) updates.label = v.label;
  if (v.headerTitle !== undefined) updates.headerTitle = v.headerTitle;
  if (v.headerSubtitle !== undefined) updates.headerSubtitle = v.headerSubtitle;
  if (v.contactLine !== undefined) updates.contactLine = v.contactLine;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ token: toDto(existing) });
  }

  const [updated] = await db
    .update(schema.shareTokens)
    .set(updates)
    .where(eq(schema.shareTokens.id, tokenId))
    .returning();

  return NextResponse.json({ token: toDto(updated) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const tokenId = parseId(id);
  if (tokenId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const existing = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.id, tokenId),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.userId !== user.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (existing.revokedAt != null) {
    return NextResponse.json({ token: toDto(existing) });
  }

  const [updated] = await db
    .update(schema.shareTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.shareTokens.id, tokenId))
    .returning();

  return NextResponse.json({ token: toDto(updated) });
}
