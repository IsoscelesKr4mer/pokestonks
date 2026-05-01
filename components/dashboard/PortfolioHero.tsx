'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDashboardTotals, type DashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { animateNumber, attachHologramParallax } from '@/lib/motion';
import { DeltaPill } from '@/components/prices/DeltaPill';
import { RefreshHeldButton } from '@/components/prices/RefreshHeldButton';

function HologramTotal({ cents }: { cents: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancelRoll = animateNumber(el, 0, cents, {
      durationMs: 600,
      format: (n) => formatCents(Math.round(n)),
    });
    const detachParallax = attachHologramParallax(el);
    return () => {
      cancelRoll();
      detachParallax();
    };
  }, [cents]);
  return (
    <span
      ref={ref}
      className="holo-text font-bold text-[64px] tracking-[-0.025em] leading-none tabular-nums"
      style={{
        background:
          'linear-gradient(var(--holo-angle, 110deg), #b58cff 0%, #5cd0ff 25%, #5be3a4 50%, #ffd66b 75%, #ff8db1 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {formatCents(cents)}
    </span>
  );
}

export function PortfolioHero({
  data,
  isLoading,
}: {
  data: DashboardTotals | null | undefined;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div className="vault-card p-8 animate-pulse h-[180px]" />;
  }
  if (!data || data.lotCount === 0) return null;
  const nothingPriced = data.pricedInvestedCents === 0;

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-end">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-meta font-mono">
              Vault total · {new Date().toISOString().slice(0, 10)}
            </div>
            <RefreshHeldButton />
          </div>
          {nothingPriced ? (
            <div className="text-[40px] text-meta font-mono">--</div>
          ) : (
            <HologramTotal cents={data.totalCurrentValueCents} />
          )}
          {!nothingPriced && (
            <div className="flex gap-[18px] items-baseline font-mono text-[12px] text-text-muted">
              <span>
                <span
                  className={
                    data.unrealizedPnLCents >= 0
                      ? 'text-positive font-semibold'
                      : 'text-negative font-semibold'
                  }
                >
                  {data.unrealizedPnLCents >= 0 ? '▲' : '▼'}{' '}
                  {formatCentsSigned(data.unrealizedPnLCents)} &middot;{' '}
                  {formatPct(data.unrealizedPnLPct ?? 0)}
                </span>{' '}
                unrealized
              </span>
              <span className="text-meta-dim">&middot;</span>
              <span>
                <span
                  className={
                    data.realizedPnLCents >= 0
                      ? 'text-positive font-semibold'
                      : 'text-negative font-semibold'
                  }
                >
                  {formatCentsSigned(data.realizedPnLCents)}
                </span>{' '}
                realized
              </span>
            </div>
          )}
          {!nothingPriced && (
            <div>
              <DeltaPill
                deltaCents={data.portfolioDelta7dCents ?? null}
                deltaPct={data.portfolioDelta7dPct ?? null}
              />
              {data.deltaCoverage != null &&
                data.deltaCoverage.covered < data.deltaCoverage.total && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on {data.deltaCoverage.covered} of {data.deltaCoverage.total} holdings
                  </p>
                )}
            </div>
          )}
        </div>

        <div className="vault-card grid grid-cols-3 gap-[14px] p-[18px]">
          <Stat
            label="Invested"
            value={formatCents(data.totalInvestedCents)}
            sub={`${data.lotCount} ${data.lotCount === 1 ? 'lot' : 'lots'}`}
          />
          <Stat
            label="Unrealized"
            value={nothingPriced ? '--' : formatCentsSigned(data.unrealizedPnLCents)}
            sub={nothingPriced ? '' : formatPct(data.unrealizedPnLPct ?? 0)}
            tone={
              nothingPriced ? 'muted' : data.unrealizedPnLCents >= 0 ? 'positive' : 'negative'
            }
          />
          <Stat
            label="Realized"
            value={formatCentsSigned(data.realizedPnLCents)}
            sub={`${data.saleEventCount} ${data.saleEventCount === 1 ? 'sale' : 'sales'}`}
            tone={data.realizedPnLCents >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      {nothingPriced && (
        <div className="text-[12px] text-meta font-mono">
          <Link href="/catalog" className="underline">
            Refresh prices on the catalog page
          </Link>
        </div>
      )}

      <div className="font-mono text-[11px] text-meta flex gap-3 flex-wrap">
        <span>{data.lotCount} lots</span>
        <span className="text-meta-dim">&middot;</span>
        <span>{data.pricedCount} priced</span>
        <span className="text-meta-dim">&middot;</span>
        <span>{data.unpricedCount} unpriced</span>
        {data.staleCount > 0 && (
          <>
            <span className="text-meta-dim">&middot;</span>
            <span>{data.staleCount} stale</span>
          </>
        )}
        {data.saleEventCount > 0 && (
          <>
            <span className="text-meta-dim">&middot;</span>
            <span>
              {data.saleEventCount} {data.saleEventCount === 1 ? 'sale' : 'sales'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}) {
  return (
    <div className="grid gap-1">
      <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">{label}</div>
      <div
        className={`text-[22px] font-semibold tracking-[-0.015em] tabular-nums ${
          tone === 'positive'
            ? 'text-positive'
            : tone === 'negative'
              ? 'text-negative'
              : tone === 'muted'
                ? 'text-text-muted'
                : 'text-text'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] font-mono text-meta">{sub}</div>}
    </div>
  );
}

export function PortfolioHeroLive() {
  const { data, isLoading } = useDashboardTotals();
  return <PortfolioHero data={data} isLoading={isLoading} />;
}
