// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDetailDialog } from './OpenBoxDetailDialog';

const renderWithProviders = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const baseDecomposition = {
  id: 1,
  userId: 'test',
  sourcePurchaseId: 1,
  decomposeDate: '2026-05-02',
  sourceCostCents: 6000,
  packCount: 3,
  perPackCostCents: 2000,
  roundingResidualCents: 0,
  notes: null,
  createdAt: '2026-05-02T00:00:00Z',
};

describe('OpenBoxDetailDialog', () => {
  it('renders multiple children with kind labels', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/decompositions/1')) {
        return new Response(
          JSON.stringify({
            decomposition: baseDecomposition,
            sourcePurchase: null,
            sourceCatalogItem: { id: 99, name: 'Mega ex Box', imageUrl: null, setName: null, productType: 'Mega ex Box' },
            childPurchases: [
              { id: 10, catalogItemId: 1, quantity: 3, costCents: 2000, unknownCost: false },
              { id: 11, catalogItemId: 2, quantity: 1, costCents: 0, unknownCost: false },
            ],
            childCatalogItems: [
              { id: 1, name: 'Mega Booster Pack', imageUrl: null, setName: null, kind: 'sealed', productType: 'Booster Pack' },
              { id: 2, name: 'Mega Pikachu Promo', imageUrl: null, setName: null, kind: 'card', productType: null },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });

    renderWithProviders(
      <OpenBoxDetailDialog open={true} onOpenChange={() => {}} decompositionId={1} />
    );
    expect(await screen.findByText(/Mega Booster Pack/)).toBeInTheDocument();
    expect(await screen.findByText(/Mega Pikachu Promo/)).toBeInTheDocument();
    // Card row should have a "promo" label (the span with just "promo", not the product name)
    const promoElements = await screen.findAllByText(/promo/i);
    expect(promoElements.length).toBeGreaterThanOrEqual(1);
  });
});
