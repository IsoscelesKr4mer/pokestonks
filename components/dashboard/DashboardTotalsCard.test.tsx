// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardTotalsCard } from './DashboardTotalsCard';
import type { PortfolioPnL } from '@/lib/services/pnl';

vi.mock('@/lib/query/hooks/useDashboardTotals', () => ({
  useDashboardTotals: vi.fn(),
}));
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseData: PortfolioPnL = {
  totalInvestedCents: 543210,
  pricedInvestedCents: 498765,
  totalCurrentValueCents: 610955,
  unrealizedPnLCents: 112190,
  unrealizedPnLPct: 22.49,
  realizedRipPnLCents: -2430,
  pricedCount: 11,
  unpricedCount: 1,
  staleCount: 2,
  lotCount: 12,
  perHolding: [],
  bestPerformers: [],
  worstPerformers: [],
};

describe('DashboardTotalsCard', () => {
  it('renders nothing when zero lots', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseData, lotCount: 0 },
      isLoading: false,
    });
    const { container } = render(withQuery(<DashboardTotalsCard />));
    expect(container.textContent).toBe('');
  });

  it('renders all four stats with signed P&L on happy path', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: baseData,
      isLoading: false,
    });
    render(withQuery(<DashboardTotalsCard />));
    expect(screen.getByText('Invested')).toBeTruthy();
    expect(screen.getByText('Current value')).toBeTruthy();
    expect(screen.getByText('Unrealized P&L')).toBeTruthy();
    expect(screen.getByText('Realized rip P&L')).toBeTruthy();
    expect(screen.getByText('$5,432.10')).toBeTruthy();
    expect(screen.getByText('$6,109.55')).toBeTruthy();
    // signed +$1,121.90
    expect(screen.getByText(/\+\$1,121\.90/)).toBeTruthy();
    // signed -$24.30
    expect(screen.getByText(/-\$24\.30/)).toBeTruthy();
    // caption
    expect(screen.getByText(/12 lots · 11 priced · 1 unpriced · 2 stale/)).toBeTruthy();
  });

  it('renders em-dash for current value and P&L when nothing priced', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseData, pricedInvestedCents: 0, pricedCount: 0, unpricedCount: 12, totalCurrentValueCents: 0, unrealizedPnLCents: 0, unrealizedPnLPct: null, staleCount: 0 },
      isLoading: false,
    });
    render(withQuery(<DashboardTotalsCard />));
    // both current value and P&L are em-dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
