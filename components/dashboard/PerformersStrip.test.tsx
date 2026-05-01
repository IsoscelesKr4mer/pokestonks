// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerformersStrip } from './PerformersStrip';

vi.mock('@/lib/query/hooks/useDashboardTotals', () => ({
  useDashboardTotals: () => ({
    data: {
      bestPerformers: [
        {
          catalogItemId: 1,
          name: 'SV 151 ETB',
          kind: 'sealed',
          imageUrl: null,
          imageStoragePath: null,
          lastMarketCents: 5999,
          pnlCents: 7756,
          pnlPct: 47.8,
          qtyHeld: 4,
        },
        {
          catalogItemId: 2,
          name: 'Paldean Fates Bundle',
          kind: 'sealed',
          imageUrl: null,
          imageStoragePath: null,
          lastMarketCents: 3142,
          pnlCents: 2601,
          pnlPct: 38.1,
          qtyHeld: 3,
        },
      ],
    },
  }),
}));

describe('<PerformersStrip>', () => {
  it('renders the top performers', () => {
    render(<PerformersStrip />);
    expect(screen.getByText('SV 151 ETB')).toBeDefined();
    expect(screen.getByText(/\+47\.8%/)).toBeDefined();
  });
});
