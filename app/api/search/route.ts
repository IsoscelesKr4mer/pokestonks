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
  const localCount = local.sealed.length + local.cards.length;
  // Trust local only when (a) at least one row has a populated price, AND
  // (b) the query has a narrowing token (setCode or card-number) so we can
  // be confident the local rows aren't an arbitrary slice of past lazy
  // imports. For pure-text queries like "pikachu" the local catalog only
  // covers sets that were imported by previous searches, so falling through
  // to upstream is the only way to get the full result set.
  const localHasAnyPrice =
    local.sealed.some((r) => r.marketCents !== null) ||
    local.cards.some((r) => r.marketCents !== null);
  const hasNarrowingToken =
    tokens.setCode !== null ||
    tokens.cardNumberFull !== null ||
    tokens.cardNumberPartial !== null;
  if (localCount > 0 && localHasAnyPrice && hasNarrowingToken) {
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

  // 2) Nothing usable in local. Fall back to the upstream-import path.
  const upstream = await searchAll(trimmed, kind, limit, sortBy);
  return NextResponse.json(
    { ...upstream, source: 'upstream' },
    {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
    }
  );
}
