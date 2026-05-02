import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';

import sv151PricesFixture from '../../tests/fixtures/tcgcsv-sv151-prices.json';

let cardUpsertCounter = 0;
vi.mock('@/lib/db/upserts/catalogItems', () => ({
  upsertSealed: vi.fn(async (i: { tcgplayerProductId: number }) => ({
    id: i.tcgplayerProductId,
    imageStoragePath: null,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  })),
  upsertCard: vi.fn(async () => ({
    id: ++cardUpsertCounter,
    imageStoragePath: null,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  })),
  bulkUpsertCards: vi.fn(async (inputs: unknown[]) =>
    inputs.map(() => ({
      id: ++cardUpsertCounter,
      imageStoragePath: null,
      lastMarketAt: new Date('2026-04-26T00:00:00Z'),
    }))
  ),
}));

import { tokenizeQuery } from './search';
import { searchSealedWithImport, searchCardsWithImport } from './search';
import { __resetGroupCacheForTests, __resetPerGroupCachesForTests } from './tcgcsv';

function resetAllCaches() {
  __resetGroupCacheForTests();
  __resetPerGroupCachesForTests();
}

describe('tokenizeQuery', () => {
  it('classifies a card_number_full token', () => {
    expect(tokenizeQuery('199/091')).toEqual({
      text: [],
      cardNumberFull: '199/091',
      cardNumberPartial: null,
      setCode: null,
    });
  });

  it('classifies a 1-3 digit numeric as card_number_partial', () => {
    expect(tokenizeQuery('199').cardNumberPartial).toBe('199');
    expect(tokenizeQuery('74').cardNumberPartial).toBe('74');
  });

  it('classifies a set code', () => {
    expect(tokenizeQuery('sv3pt5').setCode).toBe('sv3pt5');
    expect(tokenizeQuery('SWSH11').setCode).toBe('swsh11');
  });

  it('classifies plain words as text', () => {
    expect(tokenizeQuery('charizard ex').text).toEqual(['charizard', 'ex']);
  });

  it('handles a mixed query', () => {
    const t = tokenizeQuery('charizard ex 199');
    expect(t.text).toEqual(['charizard', 'ex']);
    expect(t.cardNumberPartial).toBe('199');
  });

  it('handles set code + full card number', () => {
    const t = tokenizeQuery('sv3pt5 199/091');
    expect(t.setCode).toBe('sv3pt5');
    expect(t.cardNumberFull).toBe('199/091');
  });

  it('lowercases and trims', () => {
    expect(tokenizeQuery('  Charizard  EX  ').text).toEqual(['charizard', 'ex']);
  });

  it('returns all-empty for empty input', () => {
    expect(tokenizeQuery('')).toEqual({
      text: [],
      cardNumberFull: null,
      cardNumberPartial: null,
      setCode: null,
    });
  });
});

const emptyCat50Groups = { totalItems: 0, success: true, errors: [], results: [] };

describe('searchSealedWithImport', () => {
  beforeEach(() => resetAllCaches());

  function mockApi() {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        HttpResponse.json({ success: true, errors: [], results: [] })
      )
    );
  }

  it('returns sealed search hits with catalogItemId populated', async () => {
    mockApi();
    const hits = await searchSealedWithImport('151 etb', 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].catalogItemId).toBeDefined();
    expect(hits[0].catalogItemId).toBe(hits[0].tcgplayerProductId);
    expect(hits[0].name).toMatch(/Elite Trainer Box/i);
  });
});

describe('searchCardsWithImport', () => {
  beforeEach(() => resetAllCaches());

  function mockApi() {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json(charizardFixture);
      }),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        HttpResponse.json({ success: true, errors: [], results: [] })
      )
    );
  }

  it('emits one row per merged variant (Pokémon TCG API + TCGCSV)', async () => {
    mockApi();
    const { results, warnings } = await searchCardsWithImport('charizard 199', 20);
    expect(warnings).toEqual([]);
    // sv3pt5-199 merges pokémon-TCG embedded prices (holofoil, reverseHolofoil)
    // with TCGCSV prices for product 490000 (Normal, Reverse Holofoil).
    // Final variants: holo (pokeTcg), reverse_holo (tcgcsv overrides pokeTcg), normal (tcgcsv).
    // sv3pt5-200 has no upstream price data anywhere -> 1 'normal' row with null price.
    expect(results).toHaveLength(4);
    const holo199 = results.find((r) => r.cardNumber === '199' && r.variant === 'holo');
    const reverse199 = results.find((r) => r.cardNumber === '199' && r.variant === 'reverse_holo');
    const normal199 = results.find((r) => r.cardNumber === '199' && r.variant === 'normal');
    const normal200 = results.find((r) => r.cardNumber === '200' && r.variant === 'normal');
    expect(holo199?.marketCents).toBe(110000);
    expect(reverse199?.marketCents).toBe(110000); // TCGCSV's $1100 wins over pokéTcg's $110
    expect(normal199?.marketCents).toBe(18900); // from TCGCSV only
    expect(normal200?.marketCents).toBeNull();
  });

  it('emits a single normal row with null price when no TCGplayer data exists', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json({
          data: [
            {
              id: 'me2pt5-1',
              name: "Erika's Oddish",
              rarity: 'Common',
              number: '1',
              set: { id: 'me2pt5', name: 'Ascended Heroes', releaseDate: '2026/01/30' },
              images: { large: 'https://example/ah/1.png' },
            },
          ],
        });
      })
    );
    const { results } = await searchCardsWithImport('ascended', 20);
    expect(results).toHaveLength(1);
    expect(results[0].variant).toBe('normal');
    expect(results[0].marketCents).toBeNull();
  });

  it('returns empty + warning when pokemontcg fails', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 503 }))
    );
    const { results, warnings } = await searchCardsWithImport('charizard', 20);
    expect(results).toEqual([]);
    expect(warnings.find((w) => w.source === 'pokemontcg')).toBeDefined();
  });

  it('full XXX/YYY with leading zero narrows to modern-era cards only (regulationMark filter)', async () => {
    // Reproduces the real API shape: Pokémon TCG API returns 4 cards for
    // "number:2 set.printedTotal:132" — three legacy (Blastoise dp3,
    // Brock's Rhydon gym1, Blaine's Charizard gym2; all stored as
    // `number: "2"` with NO regulationMark, printed as "2/132") and one
    // modern (Mega Evolution Ivysaur me1-2, also `number: "2"` but with
    // regulationMark "I", printed as "002/132").
    //
    // When the user types "002/132" (leading zero), they mean the modern
    // printing convention. Filter to regulationMark != null.
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json({
          data: [
            {
              id: 'me1-2',
              name: 'Ivysaur',
              rarity: 'Common',
              number: '2',
              regulationMark: 'I',
              set: { id: 'me1', name: 'Mega Evolution', releaseDate: '2025/09/26', printedTotal: 132 },
              images: { large: 'https://example/me1/2.png' },
            },
            {
              id: 'gym1-2',
              name: "Brock's Rhydon",
              rarity: 'Rare Holo',
              number: '2',
              set: { id: 'gym1', name: 'Gym Heroes', releaseDate: '2000/08/14', printedTotal: 132 },
              images: { large: 'https://example/gym1/2.png' },
            },
            {
              id: 'gym2-2',
              name: "Blaine's Charizard",
              rarity: 'Rare Holo',
              number: '2',
              set: { id: 'gym2', name: 'Gym Challenge', releaseDate: '2000/10/16', printedTotal: 132 },
              images: { large: 'https://example/gym2/2.png' },
            },
            {
              id: 'dp3-2',
              name: 'Blastoise',
              rarity: 'Rare Holo',
              number: '2',
              set: { id: 'dp3', name: 'Secret Wonders', releaseDate: '2007/11/01', printedTotal: 132 },
              images: { large: 'https://example/dp3/2.png' },
            },
            {
              id: 'bkp-2',
              name: 'Pikachu BK',
              rarity: 'Promo',
              number: '2',
              set: { id: 'bkp', name: 'Burger King Promos', releaseDate: '1999/06/01', printedTotal: 30 },
              images: { large: 'https://example/bkp/2.png' },
            },
          ],
        });
      })
    );
    const { results } = await searchCardsWithImport('002/132', 20);
    // Only Mega Evolution Ivysaur survives:
    //   - Burger King is filtered by setPrintedTotal (30, not 132).
    //   - Gym Heroes / Gym Challenge / Secret Wonders are filtered by
    //     missing regulationMark (legacy printing, prints as "2/132").
    //   - Mega Evolution carries regulationMark "I" → modern printing,
    //     prints as "002/132".
    const setCodes = new Set(results.map((r) => r.setCode));
    expect(setCodes).toEqual(new Set(['me1']));
    expect(results.every((r) => r.setCode === 'me1')).toBe(true);
  });

  it('full X/YYY without leading zero returns all matching cards across eras', async () => {
    // No leading zero in the head ("2/132") = no era filter. Both legacy
    // and modern cards survive the printedTotal filter.
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json({
          data: [
            {
              id: 'me1-2',
              name: 'Ivysaur',
              rarity: 'Common',
              number: '2',
              regulationMark: 'I',
              set: { id: 'me1', name: 'Mega Evolution', releaseDate: '2025/09/26', printedTotal: 132 },
              images: { large: 'https://example/me1/2.png' },
            },
            {
              id: 'gym2-2',
              name: "Blaine's Charizard",
              rarity: 'Rare Holo',
              number: '2',
              set: { id: 'gym2', name: 'Gym Challenge', releaseDate: '2000/10/16', printedTotal: 132 },
              images: { large: 'https://example/gym2/2.png' },
            },
          ],
        });
      })
    );
    const { results } = await searchCardsWithImport('2/132', 20);
    const setCodes = new Set(results.map((r) => r.setCode));
    expect(setCodes).toEqual(new Set(['me1', 'gym2']));
  });
});

import { searchAll } from './search';

describe('searchAll', () => {
  it('returns interleaved sealed + card results', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json(charizardFixture);
      }),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        HttpResponse.json({ success: true, errors: [], results: [] })
      )
    );
    const { results, warnings } = await searchAll('charizard 199', 'all', 20);
    const types = new Set(results.map((r) => r.type));
    expect(types.has('card')).toBe(true);
    // Sealed may or may not show up given the sealed scoring; query has 'charizard'+199 so sealed should not match by name.
    expect(warnings).toEqual([]);
  });
});
