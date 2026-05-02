// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsync = vi.fn(async () => ({ id: 99 }));

vi.mock('@/lib/query/hooks/usePurchases', () => ({
  useUpdatePurchase: () => ({ mutateAsync, isPending: false }),
  usePurchaseSources: () => ({ data: { sources: [] }, isLoading: false }),
}));

import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseCatalogItem = {
  id: 1,
  kind: 'sealed' as const,
  name: 'Test ETB',
  setName: 'Test Set',
  productType: 'ETB',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  msrpCents: null,
  lastMarketCents: null,
  packCount: 9,
};

const baseLot: EditableLot = {
  id: 99,
  catalogItemId: 1,
  purchaseDate: '2026-04-01',
  quantity: 1,
  costCents: 0,
  unknownCost: true,
  source: null,
  location: null,
  notes: null,
  condition: null,
  isGraded: false,
  gradingCompany: null,
  grade: null,
  certNumber: null,
  sourceRipId: null,
  sourceDecompositionId: null,
};

describe('<EditPurchaseDialog> conversion flow', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
  });

  it('shows "Set cost basis" button for unknown-cost non-derived lot', () => {
    wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={baseLot} />);
    expect(screen.getByRole('button', { name: /set cost basis/i })).toBeDefined();
  });

  it('hides the button for unknown-cost rip-derived child', () => {
    const child: EditableLot = { ...baseLot, sourceRipId: 5 };
    wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={child} />);
    expect(screen.queryByRole('button', { name: /set cost basis/i })).toBeNull();
    expect(screen.getByText(/convert the parent lot/i)).toBeDefined();
  });

  it('hides the button for unknown-cost decomposition-derived child', () => {
    const child: EditableLot = { ...baseLot, sourceDecompositionId: 5 };
    wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={child} />);
    expect(screen.queryByRole('button', { name: /set cost basis/i })).toBeNull();
    expect(screen.getByText(/convert the parent lot/i)).toBeDefined();
  });

  it('submits PATCH with unknownCost: false and entered cents on save', async () => {
    wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={baseLot} />);
    fireEvent.click(screen.getByRole('button', { name: /set cost basis/i }));
    const input = screen.getByLabelText(/new cost basis/i);
    fireEvent.change(input, { target: { value: '12.34' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost basis/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 99,
        patch: {
          unknownCost: false,
          costCents: 1234,
        },
      });
    });
  });

  it('renders the standard form for known-cost lots', () => {
    const known: EditableLot = { ...baseLot, unknownCost: false, costCents: 5000 };
    wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={known} />);
    // Standard form has a "Save changes" or similar submit button. Don't assert exact label;
    // just confirm the conversion affordance is absent.
    expect(screen.queryByRole('button', { name: /set cost basis/i })).toBeNull();
  });
});
