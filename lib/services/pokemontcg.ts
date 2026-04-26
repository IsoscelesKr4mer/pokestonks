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
};

type RawCard = {
  id: string;
  name: string;
  rarity?: string;
  number: string;
  set: { id: string; name: string; releaseDate?: string };
  images: { small?: string; large?: string };
};

export async function searchCards(args: {
  text?: string[];
  cardNumberPartial?: string | null;
  cardNumberFull?: string | null;
  setCode?: string | null;
  pageSize?: number;
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
  const params = new URLSearchParams({
    q: parts.join(' '),
    pageSize: String(args.pageSize ?? 50),
    orderBy: '-set.releaseDate,number',
  });
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const res = await fetch(`${POKEMONTCG_BASE}/cards?${params.toString()}`, { headers });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`pokemontcg cards ${res.status}`);
  const body = (await res.json()) as { data: RawCard[] };
  return body.data.map((c) => ({
    cardId: c.id,
    name: c.name,
    rarity: c.rarity ?? null,
    number: c.number,
    setName: c.set.name ?? null,
    setCode: c.set.id ?? null,
    releaseDate: c.set.releaseDate ? c.set.releaseDate.replaceAll('/', '-') : null,
    imageUrl: c.images.large ?? c.images.small ?? null,
  }));
}
