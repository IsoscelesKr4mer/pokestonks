// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    manualMarketCents: null,
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

  it('renders a checkbox when onSelectChange is provided', () => {
    const onSelectChange = vi.fn();
    renderWithQuery(<SearchResultCard item={item} ownedQty={0} selected={false} onSelectChange={onSelectChange} />);
    const cb = screen.getByLabelText(/select /i) as HTMLInputElement;
    expect(cb).toBeDefined();
    expect(cb.checked).toBe(false);
  });

  it('calls onSelectChange when checkbox toggled', () => {
    const onSelectChange = vi.fn();
    renderWithQuery(<SearchResultCard item={item} ownedQty={0} selected={false} onSelectChange={onSelectChange} />);
    const cb = screen.getByLabelText(/select /i);
    fireEvent.click(cb);
    expect(onSelectChange).toHaveBeenCalledWith(true);
  });

  it('does not render checkbox when onSelectChange omitted', () => {
    renderWithQuery(<SearchResultCard item={item} ownedQty={0} />);
    expect(screen.queryByLabelText(/select /i)).toBeNull();
  });
});
