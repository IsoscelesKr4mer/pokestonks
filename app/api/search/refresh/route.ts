import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll } from '@/lib/services/search';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(600).default(60),
  sortBy: z
    .enum(['price-desc', 'price-asc', 'rarity-desc', 'relevance', 'released', 'name'])
    .default('price-desc'),
});

export async function POST(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit, sortBy } = parsed.data;

  // Always run upstream. searchAll's bulk-upsert path writes
  // last_market_cents and last_market_at = NOW() so the next GET reads
  // fresh data from local.
  const upstream = await searchAll(q.trim(), kind, limit, sortBy);
  return NextResponse.json(
    { ...upstream, source: 'refresh' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
