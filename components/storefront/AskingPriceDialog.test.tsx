// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpsert = vi.fn();
const mockRemove = vi.fn();

vi.mock('@/lib/query/hooks/useStorefront', () => ({
  useUpsertStorefrontListing: () => ({
    mutateAsync: mockUpsert,
    isPending: false,
  }),
  useRemoveStorefrontListing: () => ({
    mutateAsync: mockRemove,
    isPending: false,
  }),
}));

import { AskingPriceDialog } from './AskingPriceDialog';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AskingPriceDialog', () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockRemove.mockReset();
  });

  it('shows "Storefront entry" title when not listed', () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={null}
        initialHidden={false}
        autoPriceCents={null}
      />
    );
    expect(screen.getByText(/Storefront entry/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reset to default/i })).toBeNull();
  });

  it('shows "Edit storefront entry" title and Reset button when listed', () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={6000}
        initialHidden={false}
        autoPriceCents={null}
      />
    );
    expect(screen.getByText(/Edit storefront entry/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset to default/i })).toBeTruthy();
  });

  it('upserts on Save', async () => {
    mockUpsert.mockResolvedValueOnce({ listing: {} });
    wrap(
      <AskingPriceDialog
        catalogItemId={42}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={null}
        initialHidden={false}
        autoPriceCents={null}
      />
    );
    const input = screen.getByLabelText(/Asking price/i);
    fireEvent.change(input, { target: { value: '60.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    // Wait a tick for the async submit
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpsert).toHaveBeenCalledWith({ catalogItemId: 42, askingPriceCents: 6000 });
  });

  it('rejects asking price above the cap', async () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={null}
        initialHidden={false}
        autoPriceCents={null}
      />
    );
    const input = screen.getByLabelText(/Asking price/i);
    fireEvent.change(input, { target: { value: '1000001.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/cannot exceed \$1,000,000/i)).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('shows hidden state and Reset button when initialHidden is true', () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={null}
        initialHidden={true}
      />
    );
    // The Reset button shows because hasOverride is true (hidden flag is an override).
    expect(screen.getByRole('button', { name: /Reset to default/i })).toBeTruthy();
    const checkbox = screen.getByRole('checkbox', { name: /Hide from storefront/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('submits hidden=true when user toggles the checkbox', async () => {
    mockUpsert.mockResolvedValueOnce({ listing: {} });
    wrap(
      <AskingPriceDialog
        catalogItemId={42}
        open={true}
        onOpenChange={() => {}}
        initialAskingCents={null}
        initialHidden={false}
      />
    );
    const checkbox = screen.getByRole('checkbox', { name: /Hide from storefront/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpsert).toHaveBeenCalledWith({ catalogItemId: 42, hidden: true });
  });
});
