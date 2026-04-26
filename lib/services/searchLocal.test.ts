import { describe, it, expect, vi } from 'vitest';

// Mock the DB client so the module can be imported without DATABASE_URL.
// The searchLocalCatalog empty-tokens test never reaches the DB call anyway.
vi.mock('@/lib/db/client', () => ({
  db: { select: vi.fn() },
  schema: {
    catalogItems: {
      id: {},
      kind: {},
      name: {},
      setName: {},
      setCode: {},
      productType: {},
      cardNumber: {},
      rarity: {},
      variant: {},
      imageUrl: {},
      imageStoragePath: {},
      lastMarketCents: {},
      lastMarketAt: {},
    },
  },
}));

import { searchLocalCatalog, __rowToDto } from './searchLocal';

describe('searchLocalCatalog', () => {
  it('returns empty when no tokens are present', async () => {
    const result = await searchLocalCatalog(
      { text: [], cardNumberFull: null, cardNumberPartial: null, setCode: null },
      'all',
      50,
      'price-desc'
    );
    expect(result.sealed).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('__rowToDto', () => {
  const baseSealedRow = {
    id: 1,
    kind: 'sealed' as const,
    name: 'Scarlet & Violet 151 Elite Trainer Box',
    setName: 'SV: Scarlet & Violet 151',
    setCode: 'mew',
    productType: 'Elite Trainer Box',
    cardNumber: null,
    rarity: null,
    variant: null,
    imageUrl: 'https://upstream.example/etb.png',
    imageStoragePath: 'catalog/1.webp',
    lastMarketCents: 7450,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  };

  const baseCardRow = {
    id: 2,
    kind: 'card' as const,
    name: 'Charizard ex',
    setName: 'Scarlet & Violet 151',
    setCode: 'sv3pt5',
    productType: null,
    cardNumber: '199',
    rarity: 'Special Illustration Rare',
    variant: 'holo',
    imageUrl: 'https://upstream.example/199.png',
    imageStoragePath: null,
    lastMarketCents: 110000,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  };

  it('maps a sealed row to SealedResultDto', () => {
    const dto = __rowToDto(baseSealedRow);
    expect(dto?.type).toBe('sealed');
    expect(dto?.catalogItemId).toBe(1);
    expect(dto?.marketCents).toBe(7450);
    expect(dto?.lastMarketAt).toBe('2026-04-26T00:00:00.000Z');
  });

  it('maps a card row to CardResultDto', () => {
    const dto = __rowToDto(baseCardRow);
    expect(dto?.type).toBe('card');
    expect(dto?.catalogItemId).toBe(2);
    if (dto?.type === 'card') {
      expect(dto.variant).toBe('holo');
      expect(dto.cardNumber).toBe('199');
    }
    expect(dto?.marketCents).toBe(110000);
  });

  it('returns null for a card row missing card_number', () => {
    expect(__rowToDto({ ...baseCardRow, cardNumber: null })).toBeNull();
  });

  it('returns null for a card row missing variant', () => {
    expect(__rowToDto({ ...baseCardRow, variant: null })).toBeNull();
  });

  it('returns null lastMarketAt when the column is null', () => {
    const dto = __rowToDto({ ...baseSealedRow, lastMarketAt: null });
    expect(dto?.lastMarketAt).toBeNull();
  });
});
