// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotsTable, type LotsTableRow } from './LotsTable';

describe('<LotsTable>', () => {
  const rows: LotsTableRow[] = [
    { purchaseId: 1, purchaseDate: '2026-04-14', source: 'Walmart vending', location: 'franklin', qtyRemaining: 2, qtyOriginal: 2, perUnitCostCents: 5497, perUnitMarketCents: 5999, pnlCents: 1004, pnlPct: 9.1, kind: 'sealed', productType: 'ETB' },
    { purchaseId: 2, purchaseDate: '2026-03-20', source: 'Target', location: 'downtown', qtyRemaining: 2, qtyOriginal: 3, perUnitCostCents: 2627, perUnitMarketCents: 5999, pnlCents: 6745, pnlPct: 128, kind: 'sealed', productType: 'ETB' },
  ];

  it('renders a row per lot', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('2026-04-14')).toBeDefined();
    expect(screen.getByText('2026-03-20')).toBeDefined();
  });

  it('renders the partial consumption notation when remaining < original', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/2 \/ 3 orig/)).toBeDefined();
  });

  it('renders P&L with sign', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/\+\$10\.04/)).toBeDefined();
  });
});
