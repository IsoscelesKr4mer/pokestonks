// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPerformersCard } from './DashboardPerformersCard';
import type { HoldingPnL } from '@/lib/services/pnl';

function makeHolding(overrides: Partial<HoldingPnL> = {}): HoldingPnL {
  return {
    catalogItemId: 1,
    name: 'ETB',
    setName: 'SV151',
    productType: 'Elite Trainer Box',
    kind: 'sealed',
    imageUrl: null,
    imageStoragePath: null,
    qtyHeld: 1,
    totalInvestedCents: 5000,
    lastMarketCents: 6000,
    lastMarketAt: '2026-04-27T00:00:00Z',
    currentValueCents: 6000,
    pnlCents: 1000,
    pnlPct: 20,
    priced: true,
    stale: false,
    ...overrides,
  };
}

describe('DashboardPerformersCard', () => {
  it('renders best and worst sections with rows', () => {
    render(
      <DashboardPerformersCard
        bestPerformers={[makeHolding({ catalogItemId: 1, name: 'Top' })]}
        worstPerformers={[makeHolding({ catalogItemId: 2, name: 'Bottom', pnlCents: -2000, pnlPct: -40 })]}
      />
    );
    expect(screen.getByText('Best performers')).toBeTruthy();
    expect(screen.getByText('Worst performers')).toBeTruthy();
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Bottom')).toBeTruthy();
  });

  it('renders nothing when both arrays are empty', () => {
    const { container } = render(
      <DashboardPerformersCard bestPerformers={[]} worstPerformers={[]} />
    );
    expect(container.textContent).toBe('');
  });

  it('rows link to /holdings/[catalogItemId]', () => {
    render(
      <DashboardPerformersCard
        bestPerformers={[makeHolding({ catalogItemId: 42 })]}
        worstPerformers={[]}
      />
    );
    const link = screen.getByRole('link', { name: /ETB/ });
    expect(link.getAttribute('href')).toBe('/holdings/42');
  });
});
