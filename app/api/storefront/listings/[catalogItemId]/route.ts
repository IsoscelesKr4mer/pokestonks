import 'server-only';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

type Ctx = { params: Promise<{ catalogItemId: string }> };

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

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { catalogItemId } = await ctx.params;
  const id = parseId(catalogItemId);
  if (id == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const [deleted] = await db
    .delete(schema.storefrontListings)
    .where(
      and(
        eq(schema.storefrontListings.userId, user.id),
        eq(schema.storefrontListings.catalogItemId, id)
      )
    )
    .returning();

  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    listing: {
      catalogItemId: deleted.catalogItemId,
      askingPriceCents: deleted.askingPriceCents,
      createdAt: deleted.createdAt.toISOString(),
      updatedAt: deleted.updatedAt.toISOString(),
    },
  });
}
