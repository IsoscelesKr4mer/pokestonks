import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

type Ctx = { params: Promise<{ id: string }> };

const MAX_CENTS = 10_000_000; // $100,000

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = parseId(id);
  if (catalogItemId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let body: { manualMarketCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const cents = body.manualMarketCents;
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    return NextResponse.json({ error: 'invalid_cents', limit: MAX_CENTS }, { status: 400 });
  }

  const exists = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true },
  });
  if (!exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  await db
    .update(schema.catalogItems)
    .set({ manualMarketCents: cents, manualMarketAt: now })
    .where(eq(schema.catalogItems.id, catalogItemId));

  await db
    .insert(schema.marketPrices)
    .values({
      catalogItemId,
      snapshotDate: today,
      condition: null,
      marketPriceCents: cents,
      lowPriceCents: cents,
      highPriceCents: cents,
      source: 'manual',
    })
    .onConflictDoUpdate({
      target: [
        schema.marketPrices.catalogItemId,
        schema.marketPrices.snapshotDate,
        schema.marketPrices.condition,
        schema.marketPrices.source,
      ],
      set: {
        marketPriceCents: sql`excluded.market_price_cents`,
        lowPriceCents: sql`excluded.low_price_cents`,
        highPriceCents: sql`excluded.high_price_cents`,
      },
    });

  return NextResponse.json({ manualMarketCents: cents, manualMarketAt: now.toISOString() });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = parseId(id);
  if (catalogItemId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  await db
    .update(schema.catalogItems)
    .set({ manualMarketCents: null, manualMarketAt: null })
    .where(eq(schema.catalogItems.id, catalogItemId));

  return NextResponse.json({ cleared: true });
}
