// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaleRow } from './SaleRow';
import type { SaleEventDto } from '@/lib/query/hooks/useSales';

const sample: SaleEventDto = {
  saleGroupId: 'g1',
  saleDate: '2026-04-20',
  platform: 'eBay',
  notes: null,
  catalogItem: {
    id: 5, name: 'ETB', setName: 'SV151', productType: 'ETB', kind: 'sealed',
    imageUrl: null, imageStoragePath: null,
  },
  totals: { quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 11000, realizedPnLCents: 27400 },
  rows: [],
  createdAt: '2026-04-20T00:00:00Z',
};

describe('SaleRow', () => {
  it('renders catalog name + sale date + qty + net proceeds', () => {
    render(<SaleRow sale={sample} />);
    expect(screen.getByText('ETB')).toBeInTheDocument();
    expect(screen.getByText(/2026-04-20/)).toBeInTheDocument();
    expect(screen.getByText(/2x sold/)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<SaleRow sale={sample} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
