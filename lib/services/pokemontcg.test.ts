import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';
import { searchCards } from './pokemontcg';

describe('pokemontcg.searchCards', () => {
  it('builds q=name:* number:* from text+number tokens', async () => {
    let lastUrl = '';
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json(charizardFixture);
      })
    );
    const results = await searchCards({ text: ['charizard'], cardNumberPartial: '199' });
    expect(lastUrl).toContain('q=');
    expect(decodeURIComponent(lastUrl)).toContain('name:*charizard*');
    expect(decodeURIComponent(lastUrl)).toContain('number:199');
    expect(results).toHaveLength(2);
    expect(results[0].cardId).toBe('sv3pt5-199');
    expect(results[0].imageUrl).toBe('https://images.pokemontcg.io/sv3pt5/199_hires.png');
    expect(results[0].setCode).toBe('sv3pt5');
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
