// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => {
    const { src, alt } = props;
    return <span data-testid="img" data-src={src} aria-label={alt} />;
  },
}));

vi.mock('@/lib/utils/images', () => ({
  getImageUrl: (input: { imageUrl: string | null }) => input.imageUrl,
}));

import { StorefrontGridSortable } from './StorefrontGridSortable';
import type { StorefrontViewItem } from '@/lib/services/storefront';

const mk = (overrides: Partial<StorefrontViewItem> = {}): StorefrontViewItem => ({
  catalogItemId: 1,
  name: 'A',
  setName: null,
  imageUrl: null,
  imageStoragePath: null,
  typeLabel: 'Sealed',
  qtyAvailable: 1,
  displayPriceCents: 1000,
  priceOrigin: 'auto',
  updatedAt: null,
  ...overrides,
});

function articleNames() {
  return screen.getAllByRole('article').map((a) => a.querySelector('h2')?.textContent ?? '');
}

describe('<StorefrontGridSortable>', () => {
  it('defaults to name A→Z', () => {
    render(
      <StorefrontGridSortable
        items={[
          mk({ catalogItemId: 1, name: 'Charizard' }),
          mk({ catalogItemId: 2, name: 'Bulbasaur' }),
          mk({ catalogItemId: 3, name: 'Alakazam' }),
        ]}
      />
    );
    expect(articleNames()).toEqual(['Alakazam', 'Bulbasaur', 'Charizard']);
  });

  it('switches to name Z→A', () => {
    render(
      <StorefrontGridSortable
        items={[
          mk({ catalogItemId: 1, name: 'Alakazam' }),
          mk({ catalogItemId: 2, name: 'Bulbasaur' }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText(/Sort/i), { target: { value: 'name-desc' } });
    expect(articleNames()).toEqual(['Bulbasaur', 'Alakazam']);
  });

  it('sorts price low to high', () => {
    render(
      <StorefrontGridSortable
        items={[
          mk({ catalogItemId: 1, name: 'Expensive', displayPriceCents: 10000 }),
          mk({ catalogItemId: 2, name: 'Cheap', displayPriceCents: 500 }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText(/Sort/i), { target: { value: 'price-asc' } });
    expect(articleNames()).toEqual(['Cheap', 'Expensive']);
  });

  it('sorts price high to low', () => {
    render(
      <StorefrontGridSortable
        items={[
          mk({ catalogItemId: 1, name: 'Cheap', displayPriceCents: 500 }),
          mk({ catalogItemId: 2, name: 'Expensive', displayPriceCents: 10000 }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText(/Sort/i), { target: { value: 'price-desc' } });
    expect(articleNames()).toEqual(['Expensive', 'Cheap']);
  });

  it('sorts qty most-first with name tiebreaker', () => {
    render(
      <StorefrontGridSortable
        items={[
          mk({ catalogItemId: 1, name: 'Two A', qtyAvailable: 2 }),
          mk({ catalogItemId: 2, name: 'Five', qtyAvailable: 5 }),
          mk({ catalogItemId: 3, name: 'Two B', qtyAvailable: 2 }),
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText(/Sort/i), { target: { value: 'qty-desc' } });
    expect(articleNames()).toEqual(['Five', 'Two A', 'Two B']);
  });
});
