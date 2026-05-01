import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { and, asc, eq, gte } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

const RANGE_DAYS: Record<string, number | null> = {
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '12M': 366,
  MAX: null,
};

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = Number(id);
  if (!Number.isFinite(catalogItemId) || !Number.isInteger(catalogItemId)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const rangeKey = new URL(req.url).searchParams.get('range') ?? '3M';
  if (!(rangeKey in RANGE_DAYS)) {
    return NextResponse.json({ error: `unknown_range`, range: rangeKey }, { status: 400 });
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true, manualMarketCents: true, manualMarketAt: true },
  });
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const days = RANGE_DAYS[rangeKey];
  const baseWhere = eq(schema.marketPrices.catalogItemId, catalogItemId);
  let where = baseWhere;
  if (days != null) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    where = and(baseWhere, gte(schema.marketPrices.snapshotDate, cutoff))!;
  }

  const rows = await db.query.marketPrices.findMany({
    where,
    columns: {
      snapshotDate: true,
      marketPriceCents: true,
      lowPriceCents: true,
      highPriceCents: true,
      source: true,
    },
    orderBy: (mp) => [asc(mp.snapshotDate)],
  });

  const points = rows.map((r) => ({
    date: r.snapshotDate,
    marketPriceCents: r.marketPriceCents,
    lowPriceCents: r.lowPriceCents,
    highPriceCents: r.highPriceCents,
    source: r.source as 'tcgcsv' | 'manual',
  }));

  const manualOverride =
    item.manualMarketCents != null && item.manualMarketAt != null
      ? { cents: item.manualMarketCents, setAt: item.manualMarketAt.toISOString() }
      : null;

  return NextResponse.json({ range: rangeKey, points, manualOverride });
}
