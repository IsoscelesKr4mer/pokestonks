// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RipPackDialog } from './RipPackDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const pack = {
  purchaseId: 10,
  catalogItemId: 1,
  name: 'SV151 Booster Pack',
  imageUrl: null,
  packCostCents: 500,
};

describe('<RipPackDialog> — bulk-loss math', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows full pack cost as bulk loss when no kept cards', () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => []}
      />
    );
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$5.00');
  });

  it('flips bulk loss to $0 when one card absorbs full pack cost', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
        ]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'pikachu');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$0.00');
  });

  it('even-splits pack cost across two cards by default', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async (q) => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
          { catalogItemId: 100, name: 'Charizard ex', imageUrl: null },
        ]}
      />
    );
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, 'p');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    await userEvent.click(await screen.findByRole('button', { name: /charizard ex/i }));
    const inputs = screen.getAllByLabelText(/cost/i);
    expect(inputs[0]).toHaveValue('2.50');
    expect(inputs[1]).toHaveValue('2.50');
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$0.00');
  });

  it('does not auto-resplit when user manually edits a cell', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
          { catalogItemId: 100, name: 'Charizard ex', imageUrl: null },
        ]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'p');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    await userEvent.click(await screen.findByRole('button', { name: /charizard ex/i }));
    const inputs = screen.getAllByLabelText(/cost/i);
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], '4.00');
    // Card #2 should NOT auto-update.
    expect(inputs[1]).toHaveValue('2.50');
    // Bulk loss = 5.00 - 4.00 - 2.50 = -1.50 (gain)
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$1.50');
    expect(screen.getByTestId('bulk-loss-label')).toHaveTextContent(/gain/i);
  });
});
