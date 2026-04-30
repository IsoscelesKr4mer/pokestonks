import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
import { __resetGroupCacheForTests, __resetPerGroupCachesForTests, fetchSinglePrice, getGroups, searchSealed } from './tcgcsv';

function resetAllCaches() {
  __resetGroupCacheForTests();
  __resetPerGroupCachesForTests();
}

import sv151PricesFixture from '../../tests/fixtures/tcgcsv-sv151-prices.json';

const emptyCat50Groups = { totalItems: 0, success: true, errors: [], results: [] };

describe('tcgcsv.getGroups', () => {
  beforeEach(() => resetAllCaches());

  it('fetches groups from TCGCSV on first call', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      }),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups))
    );
    const groups = await getGroups();
    expect(hits).toBe(1);
    expect(groups).toHaveLength(3);
    expect(groups[0].name).toBe('Scarlet & Violet 151');
    expect(groups[0].abbreviation).toBe('SV3PT5');
  });

  it('caches within 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      }),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups))
    );
    await getGroups();
    await getGroups();
    expect(hits).toBe(1);
  });

  it('refreshes when cache is older than 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      }),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups))
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await getGroups();
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // +8 days
    await getGroups();
    expect(hits).toBe(2);
    vi.useRealTimers();
  });
});

describe('tcgcsv.searchSealed', () => {
  beforeEach(() => resetAllCaches());

  function mockApi() {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/23244/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/23244/prices', () =>
        HttpResponse.json({ success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/1234/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/1234/prices', () =>
        HttpResponse.json({ success: true, errors: [], results: [] })
      )
    );
  }

  it('returns SV151 ETB for "151 etb" query', async () => {
    mockApi();
    const results = await searchSealed('151 etb', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toMatch(/Elite Trainer Box/i);
    expect(results[0].setName).toBe('Scarlet & Violet 151');
    expect(results[0].marketCents).toBe(7450);
  });

  it('excludes singles like "Charizard ex - 199/091"', async () => {
    mockApi();
    const results = await searchSealed('charizard', 10);
    expect(results.find((r) => /199/.test(r.name))).toBeUndefined();
  });

  it('classifies productType from name', async () => {
    mockApi();
    const all = await searchSealed('151', 10);
    const types = new Set(all.map((r) => r.productType));
    expect(types.has('Elite Trainer Box')).toBe(true);
    expect(types.has('Booster Box')).toBe(true);
    expect(types.has('Booster Bundle')).toBe(true);
  });

  it('returns empty for nonsense query', async () => {
    mockApi();
    const results = await searchSealed('zzzzzzzz', 10);
    expect(results).toEqual([]);
  });
});

describe('tcgcsv.fetchSinglePrice', () => {
  beforeEach(() => resetAllCaches());

  it('returns the market price in cents for a known product', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      )
    );
    const price = await fetchSinglePrice({ groupId: 23237, productId: 480001, subType: 'Normal' });
    expect(price?.marketCents).toBe(18999);
    expect(price?.lowCents).toBe(15999);
    expect(price?.highCents).toBe(21999);
  });

  it('returns null when productId is not in the prices CSV', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        HttpResponse.json(sv151PricesFixture)
      )
    );
    const price = await fetchSinglePrice({ groupId: 23237, productId: 99999, subType: 'Normal' });
    expect(price).toBeNull();
  });

  it('throws on 5xx', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/50/groups', () => HttpResponse.json(emptyCat50Groups)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () => new HttpResponse(null, { status: 502 }))
    );
    await expect(fetchSinglePrice({ groupId: 23237, productId: 1 })).rejects.toThrow();
  });
});
