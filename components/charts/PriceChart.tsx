'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  useCatalogHistory,
  type ChartRange,
  type PricePoint,
} from '@/lib/query/hooks/usePriceHistory';
import { ManualPricePanel } from '@/components/prices/ManualPricePanel';
import { formatCents } from '@/lib/utils/format';

export type PriceChartProps = {
  catalogItemId: number;
};

const RANGES: ChartRange[] = ['1M', '3M', '6M', '12M', 'MAX'];

export function PriceChart({ catalogItemId }: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>('3M');
  const history = useCatalogHistory(catalogItemId, range);

  if (history.isLoading) {
    return <div className="rounded-2xl border border-border/40 bg-card p-6 h-72 animate-pulse" />;
  }

  if (history.data?.manualOverride != null) {
    return (
      <ManualPricePanel
        catalogItemId={catalogItemId}
        manualMarketCents={history.data.manualOverride.cents}
        manualMarketAt={history.data.manualOverride.setAt}
      />
    );
  }

  const points = history.data?.points ?? [];

  if (points.length < 2) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-6">
        <RangeToggle range={range} onChange={setRange} />
        <div className="mt-6 flex h-56 flex-col items-center justify-center text-sm text-muted-foreground">
          <p>Tracking starts soon.</p>
          <p className="mt-1 text-xs">We snapshot daily at 21:00 UTC.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6">
      <RangeToggle range={range} onChange={setRange} />
      <ChartCanvas points={points} />
    </div>
  );
}

function RangeToggle({
  range,
  onChange,
}: {
  range: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background p-1 text-xs">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-3 py-1 transition ${
            r === range
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const PADDING = { top: 16, right: 16, bottom: 24, left: 56 };

function ChartCanvas({ points }: { points: PricePoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const height = 240;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.max(320, entry.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  type UsablePoint = PricePoint & { marketPriceCents: number };
  const usable = useMemo<UsablePoint[]>(
    () =>
      points.filter(
        (p): p is UsablePoint => p.marketPriceCents != null
      ),
    [points]
  );

  const { dPath, xs, ys, minY, maxY } = useMemo(() => {
    const innerW = width - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;
    if (usable.length === 0) {
      return { dPath: '', xs: [] as number[], ys: [] as number[], minY: 0, maxY: 0 };
    }
    const cents = usable.map((p) => p.marketPriceCents);
    const minY = Math.min(...cents);
    const maxY = Math.max(...cents);
    const yRange = Math.max(maxY - minY, 1);

    const xs = usable.map(
      (_, i) => PADDING.left + (i / Math.max(usable.length - 1, 1)) * innerW
    );
    const ys = usable.map(
      (p) => PADDING.top + innerH - ((p.marketPriceCents - minY) / yRange) * innerH
    );

    const dPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${ys[i].toFixed(2)}`).join(' ');
    return { dPath, xs, ys, minY, maxY };
  }, [usable, width]);

  const hoverPoint = hoverIdx != null ? usable[hoverIdx] : null;
  const hoverX = hoverIdx != null ? xs[hoverIdx] : null;
  const hoverY = hoverIdx != null ? ys[hoverIdx] : null;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (xs.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  return (
    <div ref={wrapRef} className="mt-4 relative">
      <svg
        width={width}
        height={height}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Price history chart"
      >
        <text
          x={PADDING.left - 8}
          y={PADDING.top + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[10px]"
        >
          {formatCents(maxY)}
        </text>
        <text
          x={PADDING.left - 8}
          y={height - PADDING.bottom + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[10px]"
        >
          {formatCents(minY)}
        </text>
        <path d={dPath} fill="none" stroke="currentColor" strokeWidth={2} className="text-emerald-400" />
        {hoverX != null && hoverY != null && hoverPoint != null && (
          <g>
            <line
              x1={hoverX}
              y1={PADDING.top}
              x2={hoverX}
              y2={height - PADDING.bottom}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
            <circle cx={hoverX} cy={hoverY} r={4} className="fill-emerald-400" />
          </g>
        )}
      </svg>
      {hoverPoint != null && hoverX != null && (
        <div
          className="pointer-events-none absolute rounded-md border border-border/40 bg-popover px-3 py-2 text-xs shadow"
          style={{ left: Math.min(width - 160, Math.max(0, hoverX + 8)), top: 8 }}
        >
          <div className="font-medium">{hoverPoint.date}</div>
          <div className="mt-1 flex justify-between gap-4">
            <span className="text-muted-foreground">Market</span>
            <span>{formatCents(hoverPoint.marketPriceCents)}</span>
          </div>
          {hoverPoint.lowPriceCents != null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Low</span>
              <span>{formatCents(hoverPoint.lowPriceCents)}</span>
            </div>
          )}
          {hoverPoint.highPriceCents != null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">High</span>
              <span>{formatCents(hoverPoint.highPriceCents)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
