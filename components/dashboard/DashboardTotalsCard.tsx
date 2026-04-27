'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Total invested</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.lotCount === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total invested</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCents(data.totalInvestedCents)}
        </div>
        <div className="text-xs text-muted-foreground">
          {data.lotCount} lot{data.lotCount === 1 ? '' : 's'} · realized rip P&amp;L:{' '}
          <span className={data.totalRipLossCents > 0 ? 'text-destructive' : 'text-foreground'}>
            {data.totalRipLossCents > 0 ? '-' : data.totalRipLossCents < 0 ? '+' : ''}
            {formatCents(Math.abs(data.totalRipLossCents))}
          </span>
        </div>
        <Link href="/holdings" className="text-sm underline">
          View holdings
        </Link>
      </CardContent>
    </Card>
  );
}
