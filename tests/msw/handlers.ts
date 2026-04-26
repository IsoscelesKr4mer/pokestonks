import { http, HttpResponse } from 'msw';

export const handlers = [
  // Default: any unmocked TCGCSV / Pokémon TCG call returns 503 so tests fail loudly.
  http.get('https://tcgcsv.com/*', () =>
    HttpResponse.json({ error: 'unmocked tcgcsv call' }, { status: 503 })
  ),
  http.get('https://api.pokemontcg.io/*', () =>
    HttpResponse.json({ error: 'unmocked pokemontcg call' }, { status: 503 })
  ),
];
