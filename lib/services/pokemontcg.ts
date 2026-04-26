const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2';

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
  for (const t of args.text ?? []) {
    parts.push(`name:*${t}*`);
  }
  if (args.cardNumberFull) {
    const [n] = args.cardNumberFull.split('/');
    parts.push(`number:${n}`);
  } else if (args.cardNumberPartial) {
    parts.push(`number:${args.cardNumberPartial}`);
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
  const headers: Record<string, string> = { Accept: 'application/json' };
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
