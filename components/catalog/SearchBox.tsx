'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultRow, type ResultRow } from './SearchResultRow';

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  results: ResultRow[];
  warnings: Array<{ source: string; message: string }>;
};

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

export function SearchBox() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'all' | 'sealed' | 'card'>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = debounced.length > 0;
  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ['search', debounced, kind],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(debounced)}&kind=${kind}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <Input
        autoFocus
        placeholder="Search Pokemon products and cards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
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

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          Try &ldquo;151 ETB&rdquo; or &ldquo;charizard 199&rdquo;.
        </p>
      )}

      {enabled && isFetching && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
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

      {data && data.results.length > 0 && (
        <div className="space-y-2">
          {data.results.map((row, i) => (
            <SearchResultRow key={i} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
