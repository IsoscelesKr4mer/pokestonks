'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { formatCents } from '@/lib/utils/format';

export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();
  if (isLoading || !data || data.lotCount === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Total invested</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCents(data.totalInvestedCents)}
        </div>
      </CardContent>
    </Card>
  );
}
