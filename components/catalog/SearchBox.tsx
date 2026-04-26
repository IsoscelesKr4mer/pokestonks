'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultRow, type ResultRow } from './SearchResultRow';

type SortBy = 'price-desc' | 'price-asc' | 'relevance' | 'name';

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: SortBy;
  results: ResultRow[];
  warnings: Array<{ source: string; message: string }>;
};

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

const SORTS: Array<{ key: SortBy; label: string }> = [
  { key: 'price-desc', label: 'Price (high to low)' },
  { key: 'price-asc', label: 'Price (low to high)' },
  { key: 'name', label: 'Name (A-Z)' },
  { key: 'relevance', label: 'Best match' },
];

const PAGE_SIZE = 24;

export function SearchBox() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'all' | 'sealed' | 'card'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('price-desc');
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset visible count whenever inputs change.
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [debounced, kind, sortBy]);

  const enabled = debounced.length > 0;
  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ['search', debounced, kind, sortBy],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(debounced)}&kind=${kind}&sortBy=${sortBy}&limit=100`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  const visible = data ? data.results.slice(0, shown) : [];
  const hasMore = data ? data.results.length > shown : false;

  return (
    <div className="space-y-4">
      <Input
        autoFocus
        placeholder="Search Pokemon products and cards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
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
        </div>
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

      {data && data.results.length === 0 && enabled && !isFetching && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      {visible.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((row, i) => (
              <SearchResultRow key={`${row.type}-${row.catalogItemId}-${i}`} row={row} />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {visible.length} of {data!.results.length}
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
