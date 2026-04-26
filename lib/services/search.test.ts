import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
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
import { searchSealedWithImport } from './search';
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
    expect(hits[0].name).toMatch(/Elite Trainer Box/i);
  });
});
