// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PortfolioHero } from './PortfolioHero';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, node);
}

const baseTotals = {
  totalInvestedCents: 223510,
  totalCurrentValueCents: 284750,
  unrealizedPnLCents: 61240,
  unrealizedPnLPct: 27.4,
  realizedPnLCents: 9420,
  realizedRipPnLCents: -800,
  realizedSalesPnLCents: 10220,
  pricedInvestedCents: 223510,
  lotCount: 12,
  pricedCount: 10,
  unpricedCount: 2,
  staleCount: 1,
  saleEventCount: 3,
  best: [],
  worst: [],
} as const;

describe('<PortfolioHero>', () => {
  it('renders the holographic total', () => {
    const { container } = render(withQuery(<PortfolioHero data={baseTotals as any} isLoading={false} />));
    expect(container.querySelector('.holo-text')).toBeTruthy();
    expect(screen.getByText('$2,847.50')).toBeDefined();
  });

  it('renders three stat blocks', () => {
    render(withQuery(<PortfolioHero data={baseTotals as any} isLoading={false} />));
    expect(screen.getByText('Invested')).toBeDefined();
    expect(screen.getByText('Unrealized')).toBeDefined();
    expect(screen.getByText('Realized')).toBeDefined();
  });

  it('renders nothing-priced state when pricedInvestedCents is 0', () => {
    render(withQuery(<PortfolioHero data={{ ...baseTotals, pricedInvestedCents: 0 } as any} isLoading={false} />));
    expect(screen.getByText(/Refresh prices/i)).toBeDefined();
  });

  it('renders the footer meta line', () => {
    render(withQuery(<PortfolioHero data={baseTotals as any} isLoading={false} />));
    expect(screen.getAllByText(/12 lots/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/10 priced/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/3 sales/).length).toBeGreaterThanOrEqual(1);
  });
});
