const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2';
const USER_AGENT = 'pokestonks/0.1 (+https://github.com/IsoscelesKr4mer/pokestonks)';

export type PokemonTcgCard = {
  cardId: string;            // 'sv3pt5-199'
  name: string;
  rarity: string | null;
  number: string;            // '199'
  setName: string | null;
  setCode: string | null;    // 'sv3pt5'
  setPrintedTotal: number | null; // 132 for a 132-card set; null when API doesn't say
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
  set: {
    id: string;
    name: string;
    releaseDate?: string;
    printedTotal?: number;
    total?: number;
  };
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
    setPrintedTotal:
      typeof c.set.printedTotal === 'number'
        ? c.set.printedTotal
        : typeof c.set.total === 'number'
        ? c.set.total
        : null,
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
  // Cap the number of upstream pages to fetch. Pokémon TCG API doesn't
  // guarantee disjoint pagination when orderBy ties, so fetching extra
  // pages and deduping by cardId fills in cards the earlier pages missed.
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
  // Pokémon TCG API stores `number` as the printed string. Some sets print
  // a card number with leading zeros (modern: "002") while others don't
  // (Gym-era: "2"). When the user typed only a partial number ("2" or "002"),
  // we widen with the OR so they find their card regardless of which form
  // the printed number uses. When the user typed the FULL XXX/YYY form,
  // they're being precise and almost always referring to a specific
  // modern-set printing — match the typed form exactly so a search for
  // "002/132" doesn't pick up Gym Heroes "2/132" cards.
  if (args.cardNumberFull) {
    const head = args.cardNumberFull.split('/')[0];
    parts.push(`number:${head}`);
  } else if (args.cardNumberPartial) {
    const numberFromQuery = args.cardNumberPartial;
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
  const maxPages = args.maxPages ?? 3;
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const baseQuery = parts.join(' ');

  // Fetch all pages in parallel. Each page is ~3s on the upstream side, so
  // sequential pagination doubles the wait. Pages don't overlap, so we can
  // safely concatenate. If a later page returns empty (we asked for more
  // than exists), filter() drops it.
  const pagePromises: Array<Promise<PokemonTcgCard[]>> = [];
  for (let page = 1; page <= maxPages; page++) {
    // No explicit orderBy: Pokémon TCG API's natural order returns cards in
    // numeric card-number sequence per set (1, 2, ..., 295), and the order
    // is stable across calls so parallel pagination produces disjoint pages.
    // Adding orderBy=-set.releaseDate,number caused `number` to be treated as
    // a string ("1", "10", "100", ...), which buried the SIRs at the back of
    // big sets and made parallel pages return overlapping results.
    const params = new URLSearchParams({
      q: baseQuery,
      pageSize: String(pageSize),
      page: String(page),
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
  // Pokémon TCG API doesn't guarantee disjoint paging when orderBy ties
  // (different pages may return some of the same cards). Dedupe by cardId
  // so downstream bulk upserts don't trip the partial unique index.
  const seen = new Set<string>();
  const out: PokemonTcgCard[] = [];
  for (const card of pages.flat()) {
    if (seen.has(card.cardId)) continue;
    seen.add(card.cardId);
    out.push(card);
  }
  return out;
}
