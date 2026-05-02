// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleDetailDialog } from './SaleDetailDialog';

vi.mock('@/lib/query/hooks/useSales', () => ({
  useSale: vi.fn(),
  useDeleteSale: vi.fn(),
}));

import { useSale, useDeleteSale } from '@/lib/query/hooks/useSales';
import type { SaleEvent } from '@/lib/types/sales';

function withQueryClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fakeSale: SaleEvent = {
  saleGroupId: 'sg-1',
  saleDate: '2025-01-15',
  platform: 'eBay',
  notes: null,
  unknownCost: false,
  catalogItem: {
    id: 42,
    name: 'SV151 Elite Trainer Box',
    setName: 'Scarlet & Violet 151',
    productType: 'Elite Trainer Box',
    kind: 'sealed',
    imageUrl: null,
    imageStoragePath: null,
  },
  totals: {
    quantity: 1,
    salePriceCents: 6500,
    feesCents: 500,
    matchedCostCents: 5000,
    realizedPnLCents: 1000,
  },
  rows: [
    {
      saleId: 1,
      purchaseId: 10,
      purchaseDate: '2024-11-01',
      perUnitCostCents: 5000,
      unknownCost: false,
      quantity: 1,
      salePriceCents: 6500,
      feesCents: 500,
      matchedCostCents: 5000,
    },
  ],
  createdAt: '2025-01-15T12:00:00Z',
};

const mockDeleteMutation = {
  mutate: vi.fn(),
  isPending: false,
};

beforeEach(() => {
  vi.mocked(useSale).mockReturnValue({
    data: fakeSale,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useSale>);
  vi.mocked(useDeleteSale).mockReturnValue(
    mockDeleteMutation as unknown as ReturnType<typeof useDeleteSale>
  );
});

describe('<SaleDetailDialog>', () => {
  it('renders a dialog title that includes the catalog item name', () => {
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.getByText(/SV151 Elite Trainer Box/i)).toBeInTheDocument();
  });

  it('shows the sale date and platform in the sub header', () => {
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.getByText(/2025-01-15/)).toBeInTheDocument();
    expect(screen.getByText(/eBay/i)).toBeInTheDocument();
  });

  it('shows a loading skeleton when data is not available', () => {
    vi.mocked(useSale).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useSale>);
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    // When loading, the sale data rows are not present
    expect(screen.queryByText(/Lot breakdown/i)).not.toBeInTheDocument();
  });

  it('shows gross, fees, matched cost values', () => {
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.getByText(/\$65\.00/)).toBeInTheDocument();
    // $5.00 (fees) and $50.00 (matched cost) may appear in multiple elements
    expect(screen.getAllByText(/\$5\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$50\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows lot breakdown row', () => {
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.getByText(/2024-11-01/)).toBeInTheDocument();
  });

  it('does not show NoBasisPill when unknownCost is false', () => {
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.queryByText(/no basis/i)).not.toBeInTheDocument();
  });

  it('shows NoBasisPill on lot row when unknownCost is true', () => {
    const saleWithNoBasis: SaleEvent = {
      ...fakeSale,
      unknownCost: true,
      rows: [{ ...fakeSale.rows[0], unknownCost: true }],
    };
    vi.mocked(useSale).mockReturnValue({
      data: saleWithNoBasis,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSale>);
    withQueryClient(
      <SaleDetailDialog open saleGroupId="sg-1" onOpenChange={() => {}} />
    );
    expect(screen.getAllByText(/no basis/i).length).toBeGreaterThanOrEqual(1);
  });
});
