import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { getImageUrl } from '@/lib/utils/images';
import type { HoldingPnL } from '@/lib/services/pnl';

export type DashboardPerformersCardProps = {
  bestPerformers: HoldingPnL[];
  worstPerformers: HoldingPnL[];
};

function PerformerRow({ holding }: { holding: HoldingPnL }) {
  return (
    <Link
      href={`/holdings/${holding.catalogItemId}`}
      className="flex items-center gap-3 rounded-md p-2 transition hover:bg-muted"
    >
      <div
        className={
          holding.kind === 'sealed'
            ? 'size-12 shrink-0 overflow-hidden rounded-md bg-muted'
            : 'h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted'
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageUrl({ imageStoragePath: holding.imageStoragePath, imageUrl: holding.imageUrl })}
          alt={holding.name}
          loading="lazy"
          className="size-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium">{holding.name}</div>
        <div className="text-xs text-muted-foreground">{holding.setName ?? '-'}</div>
      </div>
      <div className="text-right text-sm">
        <PnLDisplay pnlCents={holding.pnlCents} pnlPct={holding.pnlPct} />
      </div>
    </Link>
  );
}

export function DashboardPerformersCard({ bestPerformers, worstPerformers }: DashboardPerformersCardProps) {
  if (bestPerformers.length === 0 && worstPerformers.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Best performers
            </h3>
            <div className="space-y-1">
              {bestPerformers.map((h) => (
                <PerformerRow key={`best-${h.catalogItemId}`} holding={h} />
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Worst performers
            </h3>
            <div className="space-y-1">
              {worstPerformers.map((h) => (
                <PerformerRow key={`worst-${h.catalogItemId}`} holding={h} />
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
