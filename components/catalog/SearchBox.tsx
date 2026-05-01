'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultCard, type SearchResultItem } from './SearchResultCard';
import { RefreshButton } from './RefreshButton';
import { useHoldings } from '@/lib/query/hooks/useHoldings';

type SortBy = 'price-desc' | 'price-asc' | 'rarity-desc' | 'relevance' | 'name';

type RawResult = {
  type: 'sealed' | 'card';
  catalogItemId: number;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  rarity: string | null;
  variant: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  marketCents: number | null;
  lastMarketAt: string | null;
  manualMarketCents?: number | null;
};

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: SortBy;
  results: RawResult[];
  warnings: Array<{ source: string; message: string }>;
  source?: 'local' | 'upstream' | 'refresh';
};

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(lastMarketAt: string | null): boolean {
  if (!lastMarketAt) return true;
  const d = new Date(lastMarketAt);
  if (isNaN(d.getTime())) return false; // relative string like "4h ago" — not stale
  return Date.now() - d.getTime() > STALE_THRESHOLD_MS;
}

function rawToItem(r: RawResult): SearchResultItem {
  return {
    id: r.catalogItemId,
    name: r.name,
    kind: r.type === 'sealed' ? 'sealed' : 'card',
    setName: r.setName,
    setCode: r.setCode,
    productType: r.productType,
    rarity: r.rarity,
    imageUrl: r.imageUrl,
    imageStoragePath: r.imageStoragePath,
    lastMarketCents: r.marketCents,
    lastMarketAt: r.lastMarketAt,
    stale: isStale(r.lastMarketAt),
    manualMarketCents: r.manualMarketCents ?? null,
  };
}

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

const SORTS: Array<{ key: SortBy; label: string }> = [
  { key: 'price-desc', label: 'Price high-low' },
  { key: 'price-asc', label: 'Price low-high' },
  { key: 'rarity-desc', label: 'Rarity' },
  { key: 'name', label: 'Name A-Z' },
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

  const { data: holdingsData } = useHoldings();

  // Build a map of catalogItemId -> total quantity held
  const ownedQtyByCatalogId = useMemo(() => {
    const map = new Map<number, number>();
    if (!holdingsData) return map;
    for (const h of holdingsData.holdings) {
      map.set(h.catalogItemId, (map.get(h.catalogItemId) ?? 0) + h.qtyHeld);
    }
    return map;
  }, [holdingsData]);

  const rarityOptions = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    for (const r of data.results) {
      if (r.type === 'card' && r.rarity) seen.add(r.rarity);
    }
    return Array.from(seen).sort();
  }, [data]);

  const allItems = useMemo<SearchResultItem[]>(() => {
    if (!data) return [];
    return data.results.map(rawToItem);
  }, [data]);

  const filteredItems = useMemo(() => {
    if (rarity === ALL_RARITIES) return allItems;
    return allItems.filter((r) => r.kind === 'card' && r.rarity === rarity);
  }, [allItems, rarity]);

  const visible = filteredItems.slice(0, shown);
  const hasMore = filteredItems.length > shown;

  // Stats
  const pricedCount = filteredItems.filter((r) => r.lastMarketCents !== null).length;
  const staleCount = filteredItems.filter((r) => r.stale).length;
  const ownedCount = filteredItems.filter((r) => (ownedQtyByCatalogId.get(r.id) ?? 0) > 0).length;

  // Image pre-cache for items without a local storage path
  useEffect(() => {
    if (visible.length === 0) return;
    const ids = visible
      .filter((r) => !r.imageStoragePath)
      .map((r) => r.id)
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
      {/* Search row */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-[14px] top-1/2 -translate-y-1/2 text-meta pointer-events-none"
          />
          <input
            autoFocus
            type="text"
            placeholder="Search Pokemon products and cards"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full bg-vault border border-divider rounded-2xl pl-[44px] pr-4 py-[12px] text-[14px] focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[rgba(181,140,255,0.18)] outline-none"
          />
        </div>
        <RefreshButton
          query={debounced}
          kind={kind}
          sortBy={sortBy}
          disabled={!enabled}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-3 py-1 text-sm ${
                kind === k.key
                  ? 'bg-accent/20 border-accent/40 text-accent'
                  : 'border-divider text-meta hover:bg-hover'
              }`}
            >
              {k.label}
            </button>
          ))}
          {rarityOptions.length > 0 && kind !== 'sealed' && (
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="rounded-full border border-divider bg-vault px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-2xl border border-divider bg-vault px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          aria-label="Sort results"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty prompt */}
      {!enabled && (
        <p className="text-[13px] text-meta">
          Try &ldquo;151 ETB&rdquo;, &ldquo;pikachu&rdquo;, or a set code like &ldquo;SV03.5&rdquo;.
        </p>
      )}

      {/* Loading skeletons */}
      {enabled && isFetching && !data && (
        <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-[13px] text-negative">
          Could not reach pricing source. Try again.
        </p>
      )}

      {data && data.warnings.length > 0 && (
        <p className="text-[11px] font-mono text-meta">
          Some sources are slow: {data.warnings.map((w) => w.source).join(', ')}.
        </p>
      )}

      {data && filteredItems.length === 0 && enabled && !isFetching && (
        <p className="text-[13px] text-meta">No matches.</p>
      )}

      {/* Stats line */}
      {enabled && (data || isFetching) && (
        <div className="text-[10px] font-mono text-meta flex gap-2 items-center flex-wrap">
          <span>{filteredItems.length} RESULTS</span>
          <span className="text-meta-dim">·</span>
          <span className="text-positive">{pricedCount} PRICED</span>
          {staleCount > 0 && (
            <>
              <span className="text-meta-dim">·</span>
              <span className="text-stale">{staleCount} STALE</span>
            </>
          )}
          {ownedCount > 0 && (
            <>
              <span className="text-meta-dim">·</span>
              <span className="text-accent">{ownedCount} OWNED</span>
            </>
          )}
          {rarity !== ALL_RARITIES && data && (
            <>
              <span className="text-meta-dim">·</span>
              <span>filtered from {data.results.length}</span>
            </>
          )}
        </div>
      )}

      {/* Result grid */}
      {visible.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <SearchResultCard
                key={item.id}
                item={item}
                ownedQty={ownedQtyByCatalogId.get(item.id) ?? 0}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="px-[14px] py-[11px] rounded-2xl border border-divider bg-vault text-text text-[11px] font-mono uppercase tracking-[0.06em] hover:bg-hover"
              >
                Load more ({filteredItems.length - shown} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
