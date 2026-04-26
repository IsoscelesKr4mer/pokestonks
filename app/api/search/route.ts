import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll, applySort, tokenizeQuery } from '@/lib/services/search';
import { searchLocalCatalog } from '@/lib/services/searchLocal';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(600).default(60),
  sortBy: z
    .enum(['price-desc', 'price-asc', 'rarity-desc', 'relevance', 'released', 'name'])
    .default('price-desc'),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit, sortBy } = parsed.data;
  const trimmed = q.trim();

  // 1) Try local first. catalog_items already has every result we've ever
  //    fetched + cached prices — sub-second response when we hit.
  const tokens = tokenizeQuery(trimmed);
  const local = await searchLocalCatalog(tokens, kind, limit, sortBy);
  if (local.sealed.length + local.cards.length > 0) {
    // searchLocalCatalog already sorted+sliced, but the partition by kind
    // breaks the global sort order. Re-merge and re-sort across both lists.
    const merged = applySort([...local.sealed, ...local.cards], sortBy).slice(0, limit);
    return NextResponse.json(
      {
        query: trimmed,
        kind,
        sortBy,
        results: merged,
        warnings: local.warnings,
        source: 'local',
      },
      {
        headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
      }
    );
  }

  // 2) Nothing in local. Fall back to the upstream-import path.
  const upstream = await searchAll(trimmed, kind, limit, sortBy);
  return NextResponse.json(
    { ...upstream, source: 'upstream' },
    {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
    }
  );
}
