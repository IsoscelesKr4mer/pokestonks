'use client';
import { useQuery } from '@tanstack/react-query';
import type { PortfolioPnL } from '@/lib/services/pnl';

export type DashboardTotals = PortfolioPnL & { saleEventCount: number };

export function useDashboardTotals() {
  return useQuery({
    queryKey: ['dashboardTotals'],
    queryFn: async (): Promise<DashboardTotals> => {
      const res = await fetch('/api/dashboard/totals');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
}
