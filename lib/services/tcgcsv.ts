const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer/3';
const POKEMON_CATEGORY_ID = 3;
const GROUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation: string | null;
  isSupplemental: boolean;
  publishedOn: string;
  modifiedOn: string;
  categoryId: number;
};

let groupCache: { fetchedAt: number; groups: TcgcsvGroup[] } | null = null;

export function __resetGroupCacheForTests() {
  groupCache = null;
}

export async function getGroups(now: number = Date.now()): Promise<TcgcsvGroup[]> {
  if (groupCache && now - groupCache.fetchedAt < GROUP_CACHE_TTL_MS) {
    return groupCache.groups;
  }
  const res = await fetch(`${TCGCSV_BASE}/groups`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGCSV groups fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { results: TcgcsvGroup[] };
  groupCache = { fetchedAt: now, groups: body.results };
  return body.results;
}

export const __test = { POKEMON_CATEGORY_ID };
