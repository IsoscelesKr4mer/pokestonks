// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SellDialog } from './SellDialog';

const mockMutate = vi.fn();

vi.mock('@/lib/query/hooks/useSales', () => ({
  useFifoPreview: () => ({
    data: { ok: true, rows: [], totals: { totalSalePriceCents: 0, totalFeesCents: 0, totalMatchedCostCents: 0, realizedPnLCents: 0, qtyAvailable: 5 } },
    isLoading: false,
  }),
  useCreateSale: () => ({ mutate: mockMutate, isPending: false }),
}));

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SellDialog', () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  it('renders form fields when open', () => {
    renderWithQuery(
      <SellDialog
        open
        onOpenChange={() => {}}
        catalogItemId={5}
        catalogItemName="ETB"
        qtyHeld={5}
      />
    );
    expect(document.getElementById('qty')).toBeInTheDocument();
    expect(document.getElementById('salePrice')).toBeInTheDocument();
    expect(document.getElementById('fees')).toBeInTheDocument();
  });

  it('shows confirm sale button when open', () => {
    renderWithQuery(
      <SellDialog
        open
        onOpenChange={() => {}}
        catalogItemId={5}
        catalogItemName="ETB"
        qtyHeld={5}
      />
    );
    expect(screen.getByRole('button', { name: /confirm sale/i })).toBeInTheDocument();
  });

  it('treats $0.295 sale price as 30 cents per unit (FP edge case)', () => {
    renderWithQuery(
      <SellDialog
        open
        onOpenChange={() => {}}
        catalogItemId={5}
        catalogItemName="ETB"
        qtyHeld={5}
      />
    );

    // Fill price = 0.295, qty = 1, fees = 0
    const priceInput = document.getElementById('salePrice')!;
    fireEvent.change(priceInput, { target: { value: '0.295' } });

    // Trigger submit via confirm sale button — mock preview is ok:true so canSubmit is true
    const submitBtn = screen.getByRole('button', { name: /confirm sale/i });
    fireEvent.click(submitBtn);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ totalSalePriceCents: 30 }),
      expect.anything(),
    );
  });
});
