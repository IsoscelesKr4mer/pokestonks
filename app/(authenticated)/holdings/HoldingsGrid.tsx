'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { getImageUrl } from '@/lib/utils/images';
import type { HoldingPnL } from '@/lib/services/pnl';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { StalePill } from '@/components/holdings/StalePill';
import { UnpricedBadge } from '@/components/holdings/UnpricedBadge';
import { SellButton } from '@/components/sales/SellButton';

type SortKey = 'marketPrice' | 'value' | 'pnl' | 'pnlPct' | 'cost' | 'qty' | 'name' | 'recent';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'marketPrice', label: 'Market price' },
  { value: 'value', label: 'Total value' },
  { value: 'pnl', label: 'P&L $' },
  { value: 'pnlPct', label: 'P&L %' },
  { value: 'cost', label: 'Cost basis' },
  { value: 'qty', label: 'Quantity' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'recent', label: 'Recently added' },
];

function sortHoldings(holdings: readonly HoldingPnL[], key: SortKey): HoldingPnL[] {
  const arr = [...holdings];
  switch (key) {
    case 'marketPrice':
      // Per-unit market price desc. Unpriced sink to the bottom.
      return arr.sort((a, b) => {
        if (a.priced !== b.priced) return a.priced ? -1 : 1;
        return (b.lastMarketCents ?? 0) - (a.lastMarketCents ?? 0);
      });
    case 'value':
      // Unpriced sink to the bottom; among priced, highest value first.
      return arr.sort((a, b) => {
        if (a.priced !== b.priced) return a.priced ? -1 : 1;
        return (b.currentValueCents ?? 0) - (a.currentValueCents ?? 0);
      });
    case 'pnl':
      return arr.sort((a, b) => {
        if (a.priced !== b.priced) return a.priced ? -1 : 1;
        return (b.pnlCents ?? 0) - (a.pnlCents ?? 0);
      });
    case 'pnlPct':
      return arr.sort((a, b) => {
        if (a.priced !== b.priced) return a.priced ? -1 : 1;
        return (b.pnlPct ?? 0) - (a.pnlPct ?? 0);
      });
    case 'cost':
      return arr.sort((a, b) => b.totalInvestedCents - a.totalInvestedCents);
    case 'qty':
      return arr.sort((a, b) => b.qtyHeld - a.qtyHeld);
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'recent':
      // Server already returns recent-first order; preserve it.
      return arr;
  }
}

export function HoldingsGrid({ initialHoldings }: { initialHoldings: HoldingPnL[] }) {
  const { data } = useHoldings();
  const holdings = data?.holdings ?? initialHoldings;
  const [sortKey, setSortKey] = useState<SortKey>('marketPrice');

  const sortedHoldings = useMemo(() => sortHoldings(holdings, sortKey), [holdings, sortKey]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No holdings yet. Search for a product and click &quot;+&quot; or &quot;Log purchase&quot; to start.
        </p>
        <Link href="/catalog" className="mt-3 inline-block text-sm underline">
          Go to search
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="sort" className="text-xs text-muted-foreground">Sort by</label>
        <select
          id="sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {sortedHoldings.map((h) => (
        <div
          key={h.catalogItemId}
          className="group flex flex-col rounded-lg border bg-card p-3 transition hover:border-foreground/20"
        >
          <Link
            href={`/holdings/${h.catalogItemId}`}
            className="flex flex-col"
          >
            <div
              className={
                h.kind === 'sealed'
                  ? 'aspect-square w-full overflow-hidden rounded-md bg-muted'
                  : 'aspect-[5/7] w-full overflow-hidden rounded-md bg-muted'
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl({
                  imageStoragePath: h.imageStoragePath,
                  imageUrl: h.imageUrl,
                })}
                alt={h.name}
                loading="lazy"
                className="size-full object-contain"
              />
            </div>
            <div className="mt-3 flex-1 space-y-1">
              <div className="line-clamp-2 text-sm font-semibold leading-tight">{h.name}</div>
              <div className="text-xs text-muted-foreground">{h.setName ?? '-'}</div>
              <div className="text-xs text-muted-foreground">
                {h.kind === 'sealed' ? h.productType ?? 'Sealed' : 'Card'}
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium tabular-nums">Qty: {h.qtyHeld}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCents(h.totalInvestedCents)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                {h.priced ? (
                  <>
                    <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                      {formatCents(h.currentValueCents!)}
                      <StalePill stale={h.stale} />
                    </span>
                    <PnLDisplay pnlCents={h.pnlCents} pnlPct={h.pnlPct} />
                  </>
                ) : (
                  <UnpricedBadge />
                )}
              </div>
            </div>
          </Link>
          <div className="flex justify-end pt-2 border-t mt-2">
            <SellButton
              catalogItemId={h.catalogItemId}
              catalogItemName={h.name}
              qtyHeld={h.qtyHeld}
              variant="card"
            />
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
