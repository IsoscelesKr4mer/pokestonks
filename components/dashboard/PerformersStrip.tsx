'use client';
import Link from 'next/link';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { formatCents, formatPct } from '@/lib/utils/format';
import { DeltaPill } from '@/components/prices/DeltaPill';
import { usePrivacyMode } from '@/lib/utils/privacy';
import { ManualPriceBadge } from '@/components/prices/ManualPriceBadge';

export function PerformersStrip() {
  const { data } = useDashboardTotals();
  const { enabled: privacy } = usePrivacyMode();
  if (!data) return null;
  const top = (data.bestPerformers ?? []).slice(0, 4);
  if (top.length === 0) return null;

  return (
    <div className="grid gap-4">
      <div className="flex justify-between items-baseline">
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Top performers</h3>
        <Link href="/holdings" className="text-[12px] text-accent">
          All holdings &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {top.map((h) => (
          <Link
            key={h.catalogItemId}
            href={`/holdings/${h.catalogItemId}`}
            className="vault-card p-3 grid gap-2"
          >
            <HoldingThumbnail
              name={h.name}
              kind={h.kind}
              imageUrl={h.imageUrl ?? null}
              imageStoragePath={h.imageStoragePath ?? null}
              size="sm"
            />
            <div className="text-[12px] font-semibold leading-[1.3] line-clamp-2 min-h-[32px]">
              {h.name}
            </div>
            <div className="font-mono text-[11px] flex justify-between items-center">
              <span className="flex items-center gap-1">
                {h.lastMarketCents !== null ? formatCents(h.lastMarketCents) : '—'}
                {h.manualMarketCents != null && <ManualPriceBadge setAt={null} />}
              </span>
              {h.pnlPct !== null && !privacy && (
                <span className={h.pnlPct >= 0 ? 'text-positive' : 'text-negative'}>
                  {formatPct(h.pnlPct)}
                </span>
              )}
            </div>
            <DeltaPill deltaCents={h.delta7dCents ?? null} deltaPct={h.delta7dPct ?? null} size="sm" />
          </Link>
        ))}
      </div>
    </div>
  );
}
