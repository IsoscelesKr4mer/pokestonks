// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDialog } from './OpenBoxDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const etb = {
  purchaseId: 10,
  catalogItemId: 1,
  name: 'Ascended Heroes Elite Trainer Box',
  productType: 'Elite Trainer Box',
  imageUrl: null,
  packCount: 9,
  sourceCostCents: 5000,
  setCode: 'AH',
  setName: 'Ascended Heroes',
};

describe('<OpenBoxDialog>', () => {
  it('renders the source name + product type + pack count', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Ascended Heroes Elite Trainer Box/)).toBeInTheDocument();
    expect(screen.getByText(/Elite Trainer Box · 9 packs/)).toBeInTheDocument();
  });

  it('shows source cost basis', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Cost basis: \$50\.00/)).toBeInTheDocument();
  });

  it('previews per-pack cost with rounding residual', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    // 5000 / 9 = 555.56 → rounded to 556. 556 × 9 = 5004. residual = -4.
    expect(screen.getByTestId('decomp-preview')).toHaveTextContent('9 × Ascended Heroes Booster Pack');
    expect(screen.getByTestId('decomp-per-pack')).toHaveTextContent('$5.56');
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('-$0.04');
  });

  it('clean even-split shows zero residual', () => {
    const cleanEtb = { ...etb, packCount: 5, sourceCostCents: 555 };
    // 555 / 5 = 111 exactly → residual 0.
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={cleanEtb} />);
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('$0.00');
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    wrap(<OpenBoxDialog open onOpenChange={onOpenChange} source={etb} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
