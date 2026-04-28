'use client';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { DashboardPerformersCard } from './DashboardPerformersCard';

export function DashboardPerformersWrapper() {
  const { data } = useDashboardTotals();
  if (!data) return null;
  return (
    <DashboardPerformersCard
      bestPerformers={data.bestPerformers}
      worstPerformers={data.worstPerformers}
    />
  );
}
