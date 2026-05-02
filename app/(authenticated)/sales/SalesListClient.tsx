'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSales } from '@/lib/query/hooks/useSales';
import { ActivityTimelineRow } from '@/components/activity/ActivityTimelineRow';
import { SaleDetailDialog } from '@/components/sales/SaleDetailDialog';
import type { ActivityEvent } from '@/components/activity/ActivityTimelineRow';
import type { SaleEvent } from '@/lib/types/sales';

function saleToEvent(s: SaleEvent): ActivityEvent {
  return {
    kind: 'sale' as const,
    id: s.saleGroupId,
    date: s.saleDate,
    title: `Sold ${s.totals.quantity} · ${s.catalogItem.name}${s.platform ? ' (' + s.platform + ')' : ''}`,
    sub: `@ $${(s.totals.salePriceCents / s.totals.quantity / 100).toFixed(2)}/ea net`,
    amountCents: s.totals.realizedPnLCents,
    noBasis: s.unknownCost,
  };
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-[12px] py-[6px] rounded-full text-[11px] font-mono uppercase tracking-[0.06em] border transition-colors',
        active
          ? 'bg-accent border-accent text-text'
          : 'bg-vault border-divider text-meta hover:bg-hover',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

const PLATFORMS = ['eBay', 'TCGplayer', 'local'];

export function SalesListClient() {
  const router = useRouter();
  const params = useSearchParams();
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  const platform = params.get('platform') ?? '';
  const q = params.get('q') ?? '';

  const [selected, setSelected] = useState<string | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/sales?${next.toString()}`);
  };

  const togglePlatform = (p: string) => {
    setParam('platform', platform === p ? '' : p);
  };

  const { data, isLoading } = useSales({
    start: start || undefined,
    end: end || undefined,
    platform: platform || undefined,
    q: q || undefined,
  });

  const sales = data?.sales ?? [];
  const lifetimeRealizedPnLCents = sales.reduce(
    (acc, s) => acc + s.totals.realizedPnLCents,
    0
  );

  const exportHref = `/api/exports/sales?${params.toString()}`;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-6">
      <div className="grid gap-1 pb-[14px] border-b border-divider">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-none">Sales</h1>
        <div className="text-[11px] font-mono text-meta">
          {sales.length} EVENTS
          {sales.length > 0 && (
            <>
              {' · LIFETIME '}
              <span className={lifetimeRealizedPnLCents >= 0 ? 'text-positive' : 'text-negative'}>
                {lifetimeRealizedPnLCents >= 0 ? '+' : ''}${(lifetimeRealizedPnLCents / 100).toFixed(2)}
              </span>
              {' REALIZED'}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {PLATFORMS.map((p) => (
          <FilterPill
            key={p}
            label={p}
            active={platform === p}
            onClick={() => togglePlatform(p)}
          />
        ))}

        <input
          type="date"
          value={start}
          onChange={(e) => setParam('start', e.target.value)}
          aria-label="From date"
          className="px-[10px] py-[6px] rounded-full text-[11px] font-mono border border-divider bg-vault text-text placeholder:text-meta focus:outline-none focus:border-accent"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => setParam('end', e.target.value)}
          aria-label="To date"
          className="px-[10px] py-[6px] rounded-full text-[11px] font-mono border border-divider bg-vault text-text placeholder:text-meta focus:outline-none focus:border-accent"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Search holdings"
          aria-label="Search holdings"
          className="px-[10px] py-[6px] rounded-full text-[11px] font-mono border border-divider bg-vault text-text placeholder:text-meta focus:outline-none focus:border-accent"
        />

        <a
          href={exportHref}
          download
          className="ml-auto px-[14px] py-[8px] rounded-2xl border border-divider bg-vault text-[11px] font-mono uppercase tracking-[0.06em] hover:bg-hover transition-colors"
        >
          Export current view
        </a>
      </div>

      {isLoading ? (
        <div className="bg-vault border border-divider rounded-2xl p-8 animate-pulse h-[300px]" />
      ) : sales.length === 0 ? (
        <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">
          No sales yet. Log a sale from any holding.
        </div>
      ) : (
        <div className="vault-card py-2 relative">
          <div className="absolute left-[130px] top-[18px] bottom-[18px] w-px bg-divider pointer-events-none" />
          {sales.map((s) => (
            <button
              key={s.saleGroupId}
              type="button"
              className="w-full text-left"
              onClick={() => setSelected(s.saleGroupId)}
            >
              <ActivityTimelineRow event={saleToEvent(s)} />
            </button>
          ))}
        </div>
      )}

      <SaleDetailDialog
        open={selected != null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        saleGroupId={selected}
      />
    </div>
  );
}
