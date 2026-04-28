// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchaseForm, type PurchaseFormCatalogItem } from './PurchaseForm';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const sealed: PurchaseFormCatalogItem = {
  id: 1,
  kind: 'sealed',
  name: 'SV151 ETB',
  setName: 'SV151',
  productType: 'ETB',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  msrpCents: 5000,
  lastMarketCents: 6000,
  packCount: null,
};

const card: PurchaseFormCatalogItem = {
  id: 2,
  kind: 'card',
  name: 'Pikachu ex',
  setName: 'AH',
  productType: null,
  cardNumber: '276/217',
  rarity: 'SIR',
  variant: 'special_illustration_rare',
  imageUrl: null,
  msrpCents: null,
  lastMarketCents: 117087,
  packCount: null,
};

describe('<PurchaseForm>', () => {
  it('hides Card details for sealed kind', () => {
    wrap(<PurchaseForm mode="create" catalogItem={sealed} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/card details/i)).not.toBeInTheDocument();
  });

  it('shows Card details for card kind', () => {
    wrap(<PurchaseForm mode="create" catalogItem={card} onSubmit={vi.fn()} />);
    expect(screen.getByText(/card details/i)).toBeInTheDocument();
  });

  it('disables hard fields when initialValues.sourceRipId is set', () => {
    wrap(
      <PurchaseForm
        mode="edit"
        catalogItem={card}
        initialValues={{ sourceRipId: 99, costCents: 500, quantity: 1 }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText(/locked because this card was pulled from a rip/i)).toBeInTheDocument();
    // Date input is disabled.
    const dateInput = screen.getByDisplayValue(new Date().toISOString().slice(0, 10));
    expect(dateInput).toBeDisabled();
  });

  it('defaults cost to MSRP for sealed when no initialValues', () => {
    wrap(<PurchaseForm mode="create" catalogItem={sealed} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('50.00')).toBeInTheDocument();
  });

  it('defaults cost to last_market_cents for card when no MSRP', () => {
    wrap(<PurchaseForm mode="create" catalogItem={card} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('1170.87')).toBeInTheDocument();
  });
});
