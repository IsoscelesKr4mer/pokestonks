// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchResultCard } from './SearchResultCard';

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<SearchResultCard>', () => {
  const item = {
    id: 1,
    name: 'SV 151 ETB',
    kind: 'sealed' as const,
    setName: 'Scarlet & Violet 151',
    setCode: 'SV03.5',
    productType: 'ETB',
    rarity: null,
    imageUrl: null,
    imageStoragePath: null,
    lastMarketCents: 5999,
    lastMarketAt: '4h ago',
    stale: false,
  };

  it('renders the name and price', () => {
    renderWithQuery(<SearchResultCard item={item} ownedQty={0} />);
    expect(screen.getByText('SV 151 ETB')).toBeDefined();
    expect(screen.getByText('$59.99')).toBeDefined();
  });

  it('renders the Owned pill when ownedQty > 0', () => {
    renderWithQuery(<SearchResultCard item={item} ownedQty={4} />);
    expect(screen.getByText(/Owned · 4/)).toBeDefined();
  });
});
