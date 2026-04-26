import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll } from '@/lib/services/search';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(600).default(60),
  sortBy: z.enum(['price-desc', 'price-asc', 'rarity-desc', 'relevance', 'released', 'name']).default('price-desc'),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit, sortBy } = parsed.data;
  const result = await searchAll(q.trim(), kind, limit, sortBy);
  return NextResponse.json(result, {
    // Browser caches the response for 5 minutes (instant on F5), then serves
    // stale for another 30 minutes while quietly fetching fresh in the
    // background. Search data isn't strictly time-sensitive at this scale,
    // and the upstream-fetch path is slow enough that a half-hour SWR window
    // is the difference between "instant" and "5 second wait" on every reload.
    headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
  });
}
