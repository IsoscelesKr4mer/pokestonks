// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsync = vi.fn(async () => ({ id: 1 }));

vi.mock('@/lib/query/hooks/usePurchases', () => ({
  useCreatePurchase: () => ({ mutateAsync, isPending: false }),
}));

import { AddPurchaseDialog } from './AddPurchaseDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<AddPurchaseDialog>', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
  });

  it('renders the dialog with default header when open', () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    expect(screen.getByText('Log purchase')).toBeDefined();
  });

  it('shows "I don\'t know the cost basis" checkbox', () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    const cb = screen.getByLabelText(/don.?t know the cost basis/i);
    expect(cb).toBeDefined();
  });

  it('checking the box disables the cost field and shows helper text', () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    const cb = screen.getByLabelText(/don.?t know the cost basis/i) as HTMLInputElement;
    fireEvent.click(cb);
    const cost = screen.getByLabelText('Cost') as HTMLInputElement;
    expect(cost.disabled).toBe(true);
    expect(screen.getByText(/excluded from p&l/i)).toBeDefined();
  });

  it('flips the title and submit label when checkbox is checked', () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    fireEvent.click(screen.getByLabelText(/don.?t know the cost basis/i));
    expect(screen.getByText('Add to vault')).toBeDefined();
    expect(screen.getByRole('button', { name: /\+ add to vault/i })).toBeDefined();
  });

  it('submits unknownCost: true and costCents: 0 when checkbox is checked', async () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={42} />);
    fireEvent.click(screen.getByLabelText(/don.?t know the cost basis/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add to vault/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogItemId: 42,
          unknownCost: true,
          costCents: 0,
        })
      );
    });
  });

  it('submits with the entered cost in normal mode', async () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={42} />);
    const costInput = screen.getByLabelText('Cost');
    fireEvent.change(costInput, { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: /\+ log purchase/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogItemId: 42,
          costCents: 1250,
        })
      );
    });
    // Should NOT include unknownCost: true in normal mode (either omits or false).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mutateAsync.mock.calls as any)[0][0] as { unknownCost?: boolean };
    expect(call.unknownCost === true).toBe(false);
  });
});
