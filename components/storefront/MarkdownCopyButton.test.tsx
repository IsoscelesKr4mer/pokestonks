// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildMarkdown } from './MarkdownCopyButton';

const mkListing = (id: number, name: string, qty: number, price: number) =>
  ({
    catalogItemId: id,
    askingPriceCents: price,
    createdAt: '',
    updatedAt: '',
    item: {
      id,
      name,
      setName: null,
      kind: 'sealed' as const,
      productType: 'Booster Box',
      imageUrl: null,
      imageStoragePath: null,
      lastMarketCents: null,
      lastMarketAt: null,
    },
    qtyHeldRaw: qty,
    typeLabel: 'Booster Box',
  });

const mkToken = (overrides: Partial<{ token: string; headerTitle: string | null; headerSubtitle: string | null; contactLine: string | null }> = {}) =>
  ({
    id: 1,
    token: 'abc123',
    label: '',
    kind: 'storefront' as const,
    headerTitle: 'Sealed Pokémon',
    headerSubtitle: null,
    contactLine: 'Message me on FB Marketplace',
    createdAt: '',
    revokedAt: null,
    ...overrides,
  });

describe('buildMarkdown', () => {
  it('produces title + contact + items + link', () => {
    const md = buildMarkdown(
      [mkListing(1, 'SV151 ETB', 3, 6000), mkListing(2, 'Paldean Fates Bundle', 2, 3000)],
      mkToken(),
      'https://pokestonks.app'
    );
    expect(md).toContain('Sealed Pokémon');
    expect(md).toContain('Message me on FB Marketplace');
    expect(md).toContain('- SV151 ETB · 3 available · $60.00');
    expect(md).toContain('- Paldean Fates Bundle · 2 available · $30.00');
    expect(md).toContain('Full menu: https://pokestonks.app/storefront/abc123');
  });

  it('omits zero-qty rows', () => {
    const md = buildMarkdown(
      [mkListing(1, 'Live', 1, 1000), mkListing(2, 'Sold Out', 0, 1000)],
      mkToken(),
      'https://pokestonks.app'
    );
    expect(md).toContain('Live');
    expect(md).not.toContain('Sold Out');
  });

  it('handles missing token (no link line)', () => {
    const md = buildMarkdown([mkListing(1, 'X', 1, 100)], null, 'https://pokestonks.app');
    expect(md).not.toContain('Full menu:');
  });

  it('handles null contact and subtitle', () => {
    const md = buildMarkdown(
      [mkListing(1, 'X', 1, 100)],
      mkToken({ contactLine: null, headerSubtitle: null }),
      'https://pokestonks.app'
    );
    expect(md.split('\n')).toEqual([
      'Sealed Pokémon',
      '',
      'Available:',
      '- X · 1 available · $1.00',
      '',
      'Full menu: https://pokestonks.app/storefront/abc123',
    ]);
  });
});
