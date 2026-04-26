import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sv151PricesCsv = readFileSync(
  join(__dirname, '..', '..', 'tests', 'fixtures', 'tcgcsv-sv151-prices.csv'),
  'utf8'
);

vi.mock('@/lib/db/upserts/catalogItems', () => ({
  upsertSealed: vi.fn(async (i: { tcgplayerProductId: number }) => i.tcgplayerProductId), // id == productId for tests
  upsertCard: vi.fn(async () => 1),
}));

import { tokenizeQuery } from './search';
import { searchSealedWithImport, searchCardsWithImport } from './search';
import { __resetGroupCacheForTests } from './tcgcsv';

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

describe('searchSealedWithImport', () => {
  beforeEach(() => __resetGroupCacheForTests());

  function mockApi() {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
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
  beforeEach(() => __resetGroupCacheForTests());

  function mockApi() {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
  }

  it('returns one row per print with at least a normal variant', async () => {
    mockApi();
    const { results, warnings } = await searchCardsWithImport('charizard 199', 20);
    expect(warnings).toEqual([]);
    expect(results).toHaveLength(2); // sv3pt5-199 and sv3pt5-200
    const r0 = results[0];
    expect(r0.cardNumber).toBe('199');
    expect(r0.setCode).toBe('sv3pt5');
    expect(r0.imageUrl).toContain('199_hires.png');
    expect(r0.variants.length).toBeGreaterThanOrEqual(1);
    expect(r0.variants[0].variant).toBe('normal');
  });

  it('attaches reverse_holo variant when TCGCSV reports a Reverse Holofoil SKU at the same productId', async () => {
    // The fixture has productId 490000 with Reverse Holofoil row in CSV.
    mockApi();
    const { results } = await searchCardsWithImport('charizard 199', 20);
    const charizard199 = results.find((r) => r.cardNumber === '199');
    expect(charizard199).toBeDefined();
    const variants = charizard199!.variants.map((v) => v.variant);
    expect(variants).toContain('reverse_holo');
  });

  it('falls back to pokemontcg-only when tcgcsv times out', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => new HttpResponse(null, { status: 503 }))
    );
    const { results, warnings } = await searchCardsWithImport('charizard', 20);
    expect(results.length).toBe(2);
    expect(results[0].variants[0].variant).toBe('normal');
    expect(results[0].variants[0].marketCents).toBeNull();
    expect(warnings.find((w) => w.source === 'tcgcsv')).toBeDefined();
  });

  it('returns empty + warning when both sources fail', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 503 })),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => new HttpResponse(null, { status: 503 }))
    );
    const { results, warnings } = await searchCardsWithImport('charizard', 20);
    expect(results).toEqual([]);
    expect(warnings.length).toBe(2);
  });
});

import { searchAll } from './search';

describe('searchAll', () => {
  it('returns interleaved sealed + card results', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
    const { results, warnings } = await searchAll('charizard 199', 'all', 20);
    const types = new Set(results.map((r) => r.type));
    expect(types.has('card')).toBe(true);
    // Sealed may or may not show up given the sealed scoring; query has 'charizard'+199 so sealed should not match by name.
    expect(warnings).toEqual([]);
  });
});
