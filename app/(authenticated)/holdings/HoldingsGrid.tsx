'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import type { HoldingPnL } from '@/lib/services/pnl';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { KebabMenu, KebabMenuItem } from '@/components/ui/kebab-menu';
import { SellDialog } from '@/components/sales/SellDialog';
import { DeltaPill } from '@/components/prices/DeltaPill';
import { ManualPriceBadge } from '@/components/prices/ManualPriceBadge';
import { NoBasisPill } from '@/components/holdings/NoBasisPill';
import { usePrivacyMode } from '@/lib/utils/privacy';

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
  const { enabled: privacy } = usePrivacyMode();
  const holdings = data?.holdings ?? initialHoldings;
  const [sortKey, setSortKey] = useState<SortKey>('marketPrice');
  const [sellTarget, setSellTarget] = useState<HoldingPnL | null>(null);

  const sortedHoldings = useMemo(() => sortHoldings(holdings, sortKey), [holdings, sortKey]);

  if (holdings.length === 0) {
    return (
      <div className="bg-vault border border-divider rounded-2xl p-8 text-center">
        <p className="text-[13px] text-text-muted">
          No holdings yet. Search for a product and click + or Log purchase to start.
        </p>
        <Link href="/catalog" className="mt-3 inline-block text-[13px] text-accent underline">Go to search</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="sort" className="text-[10px] uppercase tracking-[0.14em] text-meta font-mono">Sort by</label>
        <select
          id="sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-full border border-divider bg-vault px-3 py-[6px] text-[12px] font-mono text-text"
        >
          {SORT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[14px]">
        {sortedHoldings.map((h) => {
          const isAllCollection = h.qtyHeldTracked === 0 && h.qtyHeldCollection > 0;
          const isMixed = h.qtyHeldTracked > 0 && h.qtyHeldCollection > 0;
          return (
            <div key={h.catalogItemId} className="vault-card p-[14px] grid gap-3 relative group">
              <Link href={`/holdings/${h.catalogItemId}`} className="grid gap-3">
                <HoldingThumbnail
                  name={h.name}
                  kind={h.kind}
                  imageUrl={h.imageUrl ?? null}
                  imageStoragePath={h.imageStoragePath ?? null}
                  exhibitTag={(h.kind === 'sealed' ? (h.productType ?? 'SEALED') : 'CARD').toUpperCase()}
                  stale={h.stale}
                />
                <div className="grid gap-1">
                  <div className="text-[13px] font-semibold leading-[1.3] line-clamp-2">{h.name}</div>
                  <div className="text-[11px] font-mono text-meta truncate">{h.setName ?? '--'}</div>
                </div>
                <div className="border-t border-divider pt-[10px] grid grid-cols-[1fr_auto] gap-2 items-baseline">
                  <div className="grid gap-[2px]">
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-meta font-mono">
                      <span>Market · qty {h.qtyHeld}</span>
                      {h.manualMarketCents != null && <ManualPriceBadge setAt={null} />}
                      {(isAllCollection || isMixed) && <NoBasisPill className="ml-1" />}
                    </div>
                    <div className="text-[18px] font-semibold tabular-nums tracking-[-0.01em]">
                      {h.lastMarketCents !== null ? formatCents(h.lastMarketCents) : <span className="text-meta">--</span>}
                    </div>
                  </div>
                  {isAllCollection && h.priced && !privacy ? (
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-meta text-right">No basis</div>
                  ) : h.pnlCents != null && !privacy ? (
                    <div className="font-mono text-[12px] tabular-nums text-right">
                      <div className={h.pnlCents >= 0 ? 'text-positive font-semibold' : 'text-negative font-semibold'}>
                        {formatCentsSigned(h.pnlCents)}
                      </div>
                      {h.pnlPct != null && (
                        <div className={h.pnlPct >= 0 ? 'text-positive' : 'text-negative'}>
                          {formatPct(h.pnlPct)}
                        </div>
                      )}
                    </div>
                  ) : !h.priced ? (
                    <div className="text-[10px] uppercase tracking-[0.08em] text-stale font-mono">Unpriced</div>
                  ) : null}
                </div>
                <div className="text-[10px] font-mono text-meta">
                  {privacy ? (
                    `${formatCents(h.currentValueCents ?? 0)} value`
                  ) : isAllCollection ? (
                    `${formatCents(h.currentValueCents ?? 0)} vault total`
                  ) : (
                    `${formatCents(h.currentValueCents ?? 0)} value · ${formatCents(h.totalInvestedCents)} cost`
                  )}
                  {isMixed && (
                    <span className="ml-1">· +{h.qtyHeldCollection} in collection</span>
                  )}
                </div>
                <DeltaPill deltaCents={h.delta7dCents ?? null} deltaPct={h.delta7dPct ?? null} size="sm" />
              </Link>
              <div className="absolute top-[20px] right-[20px]">
                <KebabMenu label={`Actions for ${h.name}`}>
                  {h.qtyHeld > 0 && <KebabMenuItem onSelect={() => setSellTarget(h)}>Sell</KebabMenuItem>}
                  <KebabMenuItem onSelect={() => { window.location.href = `/holdings/${h.catalogItemId}`; }}>Open detail</KebabMenuItem>
                </KebabMenu>
              </div>
            </div>
          );
        })}
      </div>
      {sellTarget && (
        <SellDialog
          open
          onOpenChange={(open) => { if (!open) setSellTarget(null); }}
          catalogItemId={sellTarget.catalogItemId}
          catalogItemName={sellTarget.name}
          qtyHeld={sellTarget.qtyHeld}
        />
      )}
    </div>
  );
}
