'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{children}</div>
    </div>
  );
}

export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.lotCount === 0) {
    return null;
  }

  const nothingPriced = data.pricedInvestedCents === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Invested">{formatCents(data.totalInvestedCents)}</Stat>
          <Stat label="Current value">
            {nothingPriced ? '—' : formatCents(data.totalCurrentValueCents)}
          </Stat>
          <Stat label="Unrealized P&L">
            {nothingPriced ? (
              <span>—</span>
            ) : (
              <PnLDisplay pnlCents={data.unrealizedPnLCents} pnlPct={data.unrealizedPnLPct} />
            )}
          </Stat>
          <Stat label="Realized rip P&L">
            <PnLDisplay pnlCents={data.realizedRipPnLCents} pnlPct={null} showPct={false} />
          </Stat>
        </div>
        {nothingPriced && (
          <div className="text-xs text-muted-foreground">
            Refresh prices on the{' '}
            <Link href="/catalog" className="underline">
              catalog page
            </Link>
            .
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {data.lotCount} lot{data.lotCount === 1 ? '' : 's'} · {data.pricedCount} priced · {data.unpricedCount} unpriced
          {data.staleCount > 0 ? ` · ${data.staleCount} stale` : ''}
        </div>
        <Link href="/holdings" className="text-sm underline">
          View holdings
        </Link>
      </CardContent>
    </Card>
  );
}
