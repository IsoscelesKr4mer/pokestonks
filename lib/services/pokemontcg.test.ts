import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';
import { searchCards } from './pokemontcg';

describe('pokemontcg.searchCards', () => {
  it('builds q with name OR set.name + number from text+number tokens', async () => {
    let lastUrl = '';
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        lastUrl = request.url;
        const page = new URL(request.url).searchParams.get('page');
        // Only return data on page 1 so the parallel-page fetch doesn't dupe.
        if (page && page !== '1') return HttpResponse.json({ data: [] });
        return HttpResponse.json(charizardFixture);
      })
    );
    const results = await searchCards({ text: ['charizard'], cardNumberPartial: '199' });
    const decoded = decodeURIComponent(lastUrl).replaceAll('+', ' ');
    expect(decoded).toContain('(name:*charizard* OR set.name:*charizard*)');
    expect(decoded).toContain('number:199');
    expect(results).toHaveLength(2);
    expect(results[0].cardId).toBe('sv3pt5-199');
    expect(results[0].imageUrl).toBe('https://images.pokemontcg.io/sv3pt5/199_hires.png');
    expect(results[0].setCode).toBe('sv3pt5');
  });

  it('strips leading zeros and ORs both forms for either partial or full queries', async () => {
    // Pokémon TCG API stores `number` without leading zeros even when the
    // physical card prints with them (e.g., Mega Evolution Ivysaur prints
    // "002/132" but the API has it as `number: "2"`). The upstream query
    // OR-widens so we don't miss the actual card. The leading-zero
    // discrimination happens in search.ts via regulationMark.
    let lastUrl = '';
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({ data: [] });
      })
    );
    await searchCards({ cardNumberFull: '074/088' });
    const decoded = decodeURIComponent(lastUrl).replaceAll('+', ' ');
    expect(decoded).toContain('(number:074 OR number:74)');
  });

  it('partial-number queries also widen across leading-zero variants', async () => {
    let lastUrl = '';
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({ data: [] });
      })
    );
    await searchCards({ cardNumberPartial: '074' });
    const decoded = decodeURIComponent(lastUrl).replaceAll('+', ' ');
    expect(decoded).toContain('(number:074 OR number:74)');
  });

  it('returns empty array on 404', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 404 }))
    );
    const results = await searchCards({ text: ['nonsense'] });
    expect(results).toEqual([]);
  });

  it('throws on 5xx', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 503 }))
    );
    await expect(searchCards({ text: ['charizard'] })).rejects.toThrow();
  });
});
