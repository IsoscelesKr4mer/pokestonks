'use client';
import Link from 'next/link';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { getImageUrl } from '@/lib/utils/images';
import type { HoldingPnL } from '@/lib/services/pnl';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { StalePill } from '@/components/holdings/StalePill';
import { UnpricedBadge } from '@/components/holdings/UnpricedBadge';

export function HoldingsGrid({ initialHoldings }: { initialHoldings: HoldingPnL[] }) {
  const { data } = useHoldings();
  const holdings = data?.holdings ?? initialHoldings;

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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {holdings.map((h) => (
        <Link
          key={h.catalogItemId}
          href={`/holdings/${h.catalogItemId}`}
          className="group flex flex-col rounded-lg border bg-card p-3 transition hover:border-foreground/20"
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
            <div className="text-xs text-muted-foreground">{h.setName ?? '—'}</div>
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
      ))}
    </div>
  );
}
