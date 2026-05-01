import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchGroupList,
  fetchProductsAndPrices,
  fetchAllPrices,
  type TcgcsvGroup,
} from './tcgcsv-live';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const groupsCsvCat3 = [
  'groupId,name,abbreviation,isSupplemental,publishedOn,modifiedOn,categoryId',
  '24688,ME05: Pitch Black,ME05,False,2026-07-17T00:00:00,2026-04-30T14:01:25.33,3',
  '2374,Miscellaneous Cards & Products,MCAP,True,2026-04-30T20:00:05,2026-04-28T04:55:29,3',
].join('\n');

const groupsCsvCat50 = [
  'groupId,name,abbreviation,isSupplemental,publishedOn,modifiedOn,categoryId',
  '2311,Storage Albums,SA,False,2026-04-30T20:00:05,2026-04-28T04:55:29,50',
].join('\n');

const ppCsv24688 = [
  'productId,name,marketPrice,lowPrice,highPrice,subTypeName',
  '101,Booster Box,99.99,95.00,110.50,',
].join('\n');

const ppCsv2374 = [
  'productId,name,marketPrice,lowPrice,highPrice,subTypeName',
  '202,Pikachu - 42/146,4.25,4.10,4.40,Normal',
].join('\n');

describe('fetchGroupList', () => {
  it('parses Groups.csv into typed objects', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(groupsCsvCat3, { status: 200 }));
    const groups = await fetchGroupList(3);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual<TcgcsvGroup>({
      groupId: 24688,
      name: 'ME05: Pitch Black',
      abbreviation: 'ME05',
      categoryId: 3,
    });
    expect(groups[1].abbreviation).toBe('MCAP');
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(fetchGroupList(3)).rejects.toThrow();
  });
});

describe('fetchProductsAndPrices', () => {
  it('parses ProductsAndPrices.csv via parseArchiveCsv', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(ppCsv24688, { status: 200 }));
    const result = await fetchProductsAndPrices(3, 24688);
    expect(result.size).toBe(1);
    expect(result.get(101)?.marketPriceCents).toBe(9999);
  });

  it('throws on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(fetchProductsAndPrices(3, 99999)).rejects.toThrow();
  });

  it('builds the URL with category and group ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('productId,marketPrice\n', { status: 200 }));
    global.fetch = fetchMock;
    await fetchProductsAndPrices(3, 24688);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('tcgplayer/3/24688/ProductsAndPrices.csv'),
      expect.any(Object)
    );
  });
});

describe('fetchAllPrices', () => {
  it('aggregates prices across multiple groups and categories', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/3/Groups.csv')) return new Response(groupsCsvCat3, { status: 200 });
      if (url.includes('/50/Groups.csv')) return new Response(groupsCsvCat50, { status: 200 });
      if (url.includes('/3/24688/ProductsAndPrices.csv')) return new Response(ppCsv24688, { status: 200 });
      if (url.includes('/3/2374/ProductsAndPrices.csv')) return new Response(ppCsv2374, { status: 200 });
      if (url.includes('/50/2311/ProductsAndPrices.csv'))
        return new Response('productId,marketPrice\n303,1.99', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAllPrices([3, 50]);
    expect(result.groupsAttempted).toBe(3); // 2 cat3 + 1 cat50
    expect(result.groupsFailed).toBe(0);
    expect(result.prices.size).toBe(3);
    expect(result.prices.get(101)?.marketPriceCents).toBe(9999);
    expect(result.prices.get(202)?.marketPriceCents).toBe(425);
    expect(result.prices.get(303)?.marketPriceCents).toBe(199);
  });

  it('tolerates per-group fetch failures and counts them', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/3/Groups.csv')) return new Response(groupsCsvCat3, { status: 200 });
      if (url.includes('/3/24688/ProductsAndPrices.csv')) return new Response(ppCsv24688, { status: 200 });
      if (url.includes('/3/2374/ProductsAndPrices.csv')) return new Response('boom', { status: 500 });
      return new Response('not found', { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAllPrices([3]);
    expect(result.groupsAttempted).toBe(2);
    expect(result.groupsFailed).toBe(1);
    expect(result.prices.size).toBe(1);
    expect(result.prices.get(101)).toBeDefined();
  });
});
