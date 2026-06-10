// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EbayMappingRow } from './EbayMappingRow';

const upsertMock = vi.fn(() => Promise.resolve({ id: 1, ebayItemId: 'x' }));
const deleteMock = vi.fn(() => Promise.resolve({ ok: true }));

vi.mock('@/lib/query/hooks/useHoldings', () => ({
  useHoldings: () => ({
    data: {
      holdings: [
        { catalogItemId: 76, name: 'Ascended Heroes Booster Bundle', qtyHeld: 1 },
        { catalogItemId: 7778, name: 'AH Meganium ex Box', qtyHeld: 0 },
      ],
    },
  }),
}));

vi.mock('@/lib/query/hooks/useEbay', () => ({
  useUpsertEbayMapping: () => ({ mutateAsync: upsertMock, isPending: false, error: null }),
  useDeleteEbayMapping: () => ({ mutateAsync: deleteMock, isPending: false, error: null }),
}));

describe('EbayMappingRow', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    deleteMock.mockClear();
  });

  it('create mode: saves the chosen catalog items', async () => {
    render(<EbayMappingRow ebayItemId="L1" title="AH Bundle" defaultOpen />);
    // Pick the bundle from the holdings picker.
    fireEvent.focus(screen.getByPlaceholderText(/search your holdings/i));
    fireEvent.click(screen.getByText('Ascended Heroes Booster Bundle'));
    fireEvent.click(screen.getByRole('button', { name: /save mapping/i }));
    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({
        ebayItemId: 'L1',
        mappings: [{ catalogItemId: 76, qty: 1 }],
      })
    );
  });

  it('edit mode: seeds rows from the existing mapping and saves changes', async () => {
    render(
      <EbayMappingRow
        ebayItemId="L2"
        title="AH Bundle"
        defaultOpen
        initialMappings={[{ catalogItemId: 76, qty: 1 }]}
      />
    );
    // The seeded item is shown (name resolves even though it could be 0-held).
    expect(screen.getByText('Ascended Heroes Booster Bundle')).toBeInTheDocument();
    // Save changes (not "Save mapping") and persists the seeded mapping.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({
        ebayItemId: 'L2',
        mappings: [{ catalogItemId: 76, qty: 1 }],
      })
    );
  });

  it('edit mode: deletes the mapping', async () => {
    render(
      <EbayMappingRow
        ebayItemId="L3"
        title="AH Bundle"
        defaultOpen
        initialMappings={[{ catalogItemId: 76, qty: 1 }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /delete mapping/i }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('L3'));
  });

  it('create mode: shows no Delete control', () => {
    render(<EbayMappingRow ebayItemId="L4" title="AH Bundle" defaultOpen />);
    expect(screen.queryByRole('button', { name: /delete mapping/i })).toBeNull();
  });

  it('edit mode: resolves names for items that are now zero-held', () => {
    render(
      <EbayMappingRow
        ebayItemId="L5"
        title="AH ex 3-pack"
        defaultOpen
        initialMappings={[{ catalogItemId: 7778, qty: 1 }]}
      />
    );
    // 7778 is qtyHeld 0 but its name still resolves from the full holdings list.
    expect(screen.getByText('AH Meganium ex Box')).toBeInTheDocument();
  });
});
