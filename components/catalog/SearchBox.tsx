'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultRow, type ResultRow } from './SearchResultRow';
import { RefreshButton } from './RefreshButton';
import { formatRelativeTime } from '@/lib/utils/time';

type SortBy = 'price-desc' | 'price-asc' | 'rarity-desc' | 'relevance' | 'name';

type ResultRowWithMeta = ResultRow & { lastMarketAt?: string | null };

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: SortBy;
  results: ResultRowWithMeta[];
  warnings: Array<{ source: string; message: string }>;
  source?: 'local' | 'upstream' | 'refresh';
};

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

const SORTS: Array<{ key: SortBy; label: string }> = [
  { key: 'price-desc', label: 'Price (high to low)' },
  { key: 'price-asc', label: 'Price (low to high)' },
  { key: 'rarity-desc', label: 'Rarity (highest first)' },
  { key: 'name', label: 'Name (A-Z)' },
  { key: 'relevance', label: 'Best match' },
];

const ALL_RARITIES = '__all__';
const PAGE_SIZE = 24;

export function SearchBox() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'all' | 'sealed' | 'card'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('price-desc');
  const [rarity, setRarity] = useState<string>(ALL_RARITIES);
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [debounced, kind, sortBy, rarity]);

  useEffect(() => {
    setRarity(ALL_RARITIES);
  }, [debounced, kind]);

  const enabled = debounced.length > 0;
  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ['search', debounced, kind, sortBy],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(debounced)}&kind=${kind}&sortBy=${sortBy}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const rarityOptions = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    for (const r of data.results) {
      if (r.type === 'card' && r.rarity) seen.add(r.rarity);
    }
    return Array.from(seen).sort();
  }, [data]);

  const filteredResults = useMemo(() => {
    if (!data) return [] as ResultRowWithMeta[];
    if (rarity === ALL_RARITIES) return data.results;
    return data.results.filter((r) => r.type === 'card' && r.rarity === rarity);
  }, [data, rarity]);

  const visible = filteredResults.slice(0, shown);
  const hasMore = filteredResults.length > shown;

  // "Updated" caption: oldest lastMarketAt among visible results = worst-case freshness.
  const oldestUpdated = useMemo(() => {
    if (visible.length === 0) return null;
    let oldest: Date | null = null;
    let anyMissing = false;
    for (const r of visible) {
      const ts = r.lastMarketAt;
      if (!ts) {
        anyMissing = true;
        continue;
      }
      const d = new Date(ts);
      if (!oldest || d < oldest) oldest = d;
    }
    return anyMissing ? null : oldest;
  }, [visible]);

  useEffect(() => {
    if (visible.length === 0) return;
    const ids = visible
      .filter((r) => !('imageStoragePath' in r) || !(r as { imageStoragePath?: string | null }).imageStoragePath)
      .map((r) => r.catalogItemId)
      .slice(0, 24);
    if (ids.length === 0) return;
    fetch('/api/cache-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, [visible]);

  return (
    <div className="space-y-4">
      <Input
        autoFocus
        placeholder="Search Pokemon products and cards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-3 py-1 text-sm ${
                kind === k.key ? 'bg-foreground text-background' : 'hover:bg-muted/50'
              }`}
            >
              {k.label}
            </button>
          ))}
          {rarityOptions.length > 0 && kind !== 'sealed' && (
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="rounded-full border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by rarity"
            >
              <option value={ALL_RARITIES}>All rarities</option>
              {rarityOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            query={debounced}
            kind={kind}
            sortBy={sortBy}
            disabled={!enabled}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Sort results"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          Try &ldquo;ascended heroes&rdquo;, &ldquo;pikachu ascended heroes&rdquo;, or &ldquo;074/088&rdquo;.
        </p>
      )}

      {enabled && isFetching && !data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Couldn&rsquo;t reach pricing source. Try again.
        </p>
      )}

      {data && data.warnings.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Some sources are slow: {data.warnings.map((w) => w.source).join(', ')}.
        </p>
      )}

      {data && filteredResults.length === 0 && enabled && !isFetching && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      {visible.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((row, i) => (
              <SearchResultRow key={`${row.type}-${row.catalogItemId}-${i}`} row={row} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {visible.length} of {filteredResults.length}
              {rarity !== ALL_RARITIES && data ? ` (filtered from ${data.results.length})` : ''}
              <span className="mx-2 text-muted-foreground/50">·</span>
              {formatRelativeTime(oldestUpdated)}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
