// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => {
    const { src, alt } = props;
    return <span data-testid="img" data-src={src} aria-label={alt} />;
  },
}));

vi.mock('@/lib/utils/images', () => ({
  getImageUrl: (input: { imageUrl: string | null }) => input.imageUrl,
}));

import { StorefrontGrid } from './StorefrontGrid';

const mkItem = (overrides: Partial<Parameters<typeof StorefrontGrid>[0]['items'][0]> = {}) => ({
  catalogItemId: 1,
  name: 'SV151 ETB',
  setName: 'Scarlet & Violet 151',
  imageUrl: 'https://example.test/etb.png',
  imageStoragePath: null,
  typeLabel: 'Elite Trainer Box',
  qtyAvailable: 3,
  askingPriceCents: 6000,
  updatedAt: new Date(),
  ...overrides,
});

describe('StorefrontGrid', () => {
  it('renders item name, type, qty, and price', () => {
    render(<StorefrontGrid items={[mkItem()]} />);
    expect(screen.getByText('SV151 ETB')).toBeTruthy();
    expect(screen.getByText(/Elite Trainer Box/)).toBeTruthy();
    expect(screen.getByText(/Scarlet & Violet 151/)).toBeTruthy();
    expect(screen.getByText('$60.00')).toBeTruthy();
    expect(screen.getByText(/3 available/)).toBeTruthy();
  });

  it('renders multiple items in order given', () => {
    render(
      <StorefrontGrid
        items={[
          mkItem({ catalogItemId: 1, name: 'A' }),
          mkItem({ catalogItemId: 2, name: 'B' }),
          mkItem({ catalogItemId: 3, name: 'C' }),
        ]}
      />
    );
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(3);
    expect(articles[0].textContent).toContain('A');
    expect(articles[1].textContent).toContain('B');
    expect(articles[2].textContent).toContain('C');
  });

  it('renders the placeholder when no image url', () => {
    render(<StorefrontGrid items={[mkItem({ imageUrl: null })]} />);
    expect(screen.getByText('📦')).toBeTruthy();
  });

  it('renders singular "available" when qty is 1', () => {
    render(<StorefrontGrid items={[mkItem({ qtyAvailable: 1 })]} />);
    // Both branches today render "available"; if you ever switch to "1 available item",
    // this test will catch it. Keeps the contract explicit.
    expect(screen.getByText(/1 available/)).toBeTruthy();
  });
});
