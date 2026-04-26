const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2';
const USER_AGENT = 'pokestonks/0.1 (+https://github.com/IsoscelesKr4mer/pokestonks)';

export type PokemonTcgCard = {
  cardId: string;            // 'sv3pt5-199'
  name: string;
  rarity: string | null;
  number: string;            // '199'
  setName: string | null;
  setCode: string | null;    // 'sv3pt5'
  releaseDate: string | null;// 'YYYY-MM-DD'
  imageUrl: string | null;   // images.large
  // Map from tcgplayer variant key ('normal', 'holofoil', 'reverseHolofoil', etc.)
  // to the market price in cents. Empty when TCGplayer has no data for this card.
  pricesByVariant: Record<string, number | null>;
};

type RawCard = {
  id: string;
  name: string;
  rarity?: string;
  number: string;
  set: { id: string; name: string; releaseDate?: string };
  images: { small?: string; large?: string };
  tcgplayer?: {
    prices?: Record<string, { market?: number | null } | null>;
  };
};

function mapRawCard(c: RawCard): PokemonTcgCard {
  const rawPrices = c.tcgplayer?.prices ?? {};
  const pricesByVariant: Record<string, number | null> = {};
  for (const [variant, p] of Object.entries(rawPrices)) {
    const market = p?.market;
    pricesByVariant[variant] = market != null ? Math.round(market * 100) : null;
  }
  return {
    cardId: c.id,
    name: c.name,
    rarity: c.rarity ?? null,
    number: c.number,
    setName: c.set.name ?? null,
    setCode: c.set.id ?? null,
    releaseDate: c.set.releaseDate ? c.set.releaseDate.replaceAll('/', '-') : null,
    imageUrl: c.images.large ?? c.images.small ?? null,
    pricesByVariant,
  };
}

export async function searchCards(args: {
  text?: string[];
  cardNumberPartial?: string | null;
  cardNumberFull?: string | null;
  setCode?: string | null;
  pageSize?: number;
  // Cap the number of upstream pages to fetch. Pokémon TCG API max pageSize
  // is 250, so maxPages=2 covers any set up to 500 cards (no real Pokémon
  // set is that large yet).
  maxPages?: number;
}): Promise<PokemonTcgCard[]> {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  const parts: string[] = [];
  // Each text token can match either the card name OR the set name. This lets
  // queries like "pikachu ascended heroes" return Pikachu cards in the Ascended
  // Heroes set (Collectr-style behavior).
  for (const t of args.text ?? []) {
    parts.push(`(name:*${t}* OR set.name:*${t}*)`);
  }
  // Pokémon TCG API stores `number` as the printed string. Sets with totals <100
  // print "74" not "074", so try both forms when the user typed "074/088".
  const numberFromQuery = args.cardNumberFull
    ? args.cardNumberFull.split('/')[0]
    : args.cardNumberPartial ?? null;
  if (numberFromQuery) {
    const stripped = numberFromQuery.replace(/^0+/, '') || '0';
    if (stripped !== numberFromQuery) {
      parts.push(`(number:${numberFromQuery} OR number:${stripped})`);
    } else {
      parts.push(`number:${numberFromQuery}`);
    }
  }
  if (args.setCode) {
    parts.push(`set.id:${args.setCode}`);
  }
  if (parts.length === 0) return [];

  const pageSize = args.pageSize ?? 50;
  const maxPages = args.maxPages ?? 2;
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const baseQuery = parts.join(' ');

  // Fetch all pages in parallel. Each page is ~3s on the upstream side, so
  // sequential pagination doubles the wait. Pages don't overlap, so we can
  // safely concatenate. If a later page returns empty (we asked for more
  // than exists), filter() drops it.
  const pagePromises: Array<Promise<PokemonTcgCard[]>> = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      q: baseQuery,
      pageSize: String(pageSize),
      page: String(page),
      orderBy: '-set.releaseDate,number',
    });
    pagePromises.push(
      (async () => {
        const res = await fetch(`${POKEMONTCG_BASE}/cards?${params.toString()}`, { headers });
        if (res.status === 404) return [];
        if (!res.ok) {
          // Page 1 errors fail loud so the caller can warn the user.
          if (page === 1) throw new Error(`pokemontcg cards ${res.status}`);
          // Later pages fail soft: we already have page 1, don't lose it.
          return [];
        }
        const body = (await res.json()) as { data: RawCard[] };
        return body.data.map(mapRawCard);
      })()
    );
  }
  const pages = await Promise.all(pagePromises);
  return pages.flat();
}
