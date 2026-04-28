// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LotRow } from './LotRow';
import type { EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';

vi.mock('@/lib/query/hooks/usePurchases', () => ({
  useDeletePurchase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePurchase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  DeletePurchaseError: class extends Error {},
}));

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const lot: EditableLot = {
  id: 1,
  catalogItemId: 1,
  purchaseDate: '2026-04-25',
  quantity: 2,
  costCents: 5000,
  source: null,
  location: null,
  notes: null,
  condition: null,
  isGraded: false,
  gradingCompany: null,
  grade: null,
  certNumber: null,
  sourceRipId: null,
};

const catalogItem: PurchaseFormCatalogItem = {
  id: 1,
  kind: 'sealed',
  name: 'ETB',
  setName: 'SV151',
  productType: 'Elite Trainer Box',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  msrpCents: null,
  lastMarketCents: 6000,
  packCount: 9,
};

describe('LotRow per-lot P&L', () => {
  it('renders Lot value + signed P&L when currentUnitMarketCents is provided', () => {
    render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={6000}
        qtyRemaining={2}
      />
    ));
    // qty=2, market=6000, cost=5000 → value=12000=$120.00, pnl=+2000=+$20.00
    expect(screen.getByText(/Lot value: \$120\.00/)).toBeTruthy();
    expect(screen.getByText(/\+\$20\.00/)).toBeTruthy();
  });

  it('omits Lot value/P&L when currentUnitMarketCents is null', () => {
    const { container } = render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={null}
        qtyRemaining={2}
      />
    ));
    expect(container.textContent).not.toMatch(/Lot value:/);
  });

  it('omits Lot value/P&L when qtyRemaining is 0', () => {
    const { container } = render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={6000}
        qtyRemaining={0}
      />
    ));
    expect(container.textContent).not.toMatch(/Lot value:/);
  });
});
