import Papa from 'papaparse';
import pLimit from 'p-limit';

export const POKEMON_CATEGORY_ID = 3;
const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${POKEMON_CATEGORY_ID}`;
const GROUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GROUP_FANOUT_LIMIT = pLimit(10);
// TCGCSV's edge rejects requests without a User-Agent (returns 401). Node's fetch
// sends none by default; identify ourselves explicitly.
const USER_AGENT = 'pokestonks/0.1 (+https://github.com/IsoscelesKr4mer/pokestonks)';

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
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`TCGCSV groups fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { results: TcgcsvGroup[] };
  groupCache = { fetchedAt: now, groups: body.results };
  return body.results;
}

const SEALED_PATTERNS: Array<{ pattern: RegExp; productType: string }> = [
  { pattern: /\bElite Trainer Box\b/i, productType: 'Elite Trainer Box' },
  { pattern: /\bBooster Box\b/i, productType: 'Booster Box' },
  { pattern: /\bBooster Bundle\b/i, productType: 'Booster Bundle' },
  { pattern: /\bPremium Collection\b/i, productType: 'Premium Collection' },
  { pattern: /\bBuild & Battle\b/i, productType: 'Build & Battle' },
  { pattern: /\bCollection Box\b/i, productType: 'Collection Box' },
  { pattern: /\bCollection\b/i, productType: 'Collection' },
  { pattern: /\bTin\b/i, productType: 'Tin' },
  { pattern: /\bBlister\b/i, productType: 'Blister' },
];

const SINGLES_REJECT = /\b(Single Card|Promo Card|Code Card)\b|\b\d+\/\d+\b/i;

export type TcgcsvProduct = {
  productId: number;
  name: string;
  cleanName: string;
  imageUrl: string | null;
  groupId: number;
  modifiedOn: string;
  extendedData?: Array<{ name: string; value: string }>;
};

export type TcgcsvPriceRow = {
  productId: number;
  marketPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  subTypeName: string;
};

export type SealedSearchHit = {
  tcgplayerProductId: number;
  name: string;
  setName: string;
  setCode: string | null;
  productType: string;
  imageUrl: string | null;
  marketCents: number | null;
  releaseDate: string | null;
  groupId: number;
};

// Per-group caches with 5-minute TTL. TCGCSV updates daily, so 5 minutes is
// safe and lets repeated card lookups within one search hit memory.
const PER_GROUP_TTL_MS = 5 * 60 * 1000;
const productsCache = new Map<number, { fetchedAt: number; data: TcgcsvProduct[] }>();
const pricesCache = new Map<number, { fetchedAt: number; data: TcgcsvPriceRow[] }>();

export function __resetPerGroupCachesForTests() {
  productsCache.clear();
  pricesCache.clear();
}

export async function fetchProducts(groupId: number, now: number = Date.now()): Promise<TcgcsvProduct[]> {
  const cached = productsCache.get(groupId);
  if (cached && now - cached.fetchedAt < PER_GROUP_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(`${TCGCSV_BASE}/${groupId}/products`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`tcgcsv products ${groupId} ${res.status}`);
  const body = (await res.json()) as { results: TcgcsvProduct[] };
  productsCache.set(groupId, { fetchedAt: now, data: body.results });
  return body.results;
}

export async function fetchPrices(groupId: number, now: number = Date.now()): Promise<TcgcsvPriceRow[]> {
  const cached = pricesCache.get(groupId);
  if (cached && now - cached.fetchedAt < PER_GROUP_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(`${TCGCSV_BASE}/${groupId}/prices`, {
    headers: { Accept: 'text/csv', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`tcgcsv prices ${groupId} ${res.status}`);
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows = parsed.data
    .filter((r) => r.productId)
    .map((r) => ({
      productId: Number(r.productId),
      marketPrice: r.marketPrice ? Number(r.marketPrice) : null,
      lowPrice: r.lowPrice ? Number(r.lowPrice) : null,
      highPrice: r.highPrice ? Number(r.highPrice) : null,
      subTypeName: r.subTypeName ?? 'Normal',
    }));
  pricesCache.set(groupId, { fetchedAt: now, data: rows });
  return rows;
}

function classifySealedType(name: string): string | null {
  for (const { pattern, productType } of SEALED_PATTERNS) {
    if (pattern.test(name)) return productType;
  }
  return null;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function score(name: string, setName: string, tokens: string[]): number {
  const haystack = `${name} ${setName}`.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(haystack)) s += 10;
    else if (haystack.includes(t)) s += 3;
  }
  return s;
}

export async function searchSealed(query: string, limit: number): Promise<SealedSearchHit[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const groups = await getGroups();
  // Filter groups whose name shares any token (broad -- narrows hot-path fetches).
  const candidateGroups = groups.filter((g) => {
    const lower = g.name.toLowerCase();
    return tokens.some((t) => lower.includes(t));
  });
  // If no group name matches, scan all groups (rare, e.g. user types "ETB").
  const groupsToFetch = candidateGroups.length > 0 ? candidateGroups : groups;

  const results: SealedSearchHit[] = [];
  await Promise.all(
    groupsToFetch.map((g) =>
      GROUP_FANOUT_LIMIT(async () => {
        const [products, prices] = await Promise.all([fetchProducts(g.groupId), fetchPrices(g.groupId)]);
        const priceByProduct = new Map<number, TcgcsvPriceRow>();
        for (const p of prices) {
          const existing = priceByProduct.get(p.productId);
          if (!existing || (existing.subTypeName !== 'Normal' && p.subTypeName === 'Normal')) {
            priceByProduct.set(p.productId, p);
          }
        }
        for (const product of products) {
          if (SINGLES_REJECT.test(product.name)) continue;
          const productType = classifySealedType(product.name);
          if (!productType) continue;
          const price = priceByProduct.get(product.productId);
          results.push({
            tcgplayerProductId: product.productId,
            name: product.name,
            setName: g.name,
            setCode: g.abbreviation ? g.abbreviation.toLowerCase() : null,
            productType,
            imageUrl: product.imageUrl,
            marketCents: price?.marketPrice != null ? Math.round(price.marketPrice * 100) : null,
            releaseDate: g.publishedOn ? g.publishedOn.slice(0, 10) : null,
            groupId: g.groupId,
          });
        }
      })
    )
  );

  return results
    .map((r) => ({ r, s: score(r.name, r.setName, tokens) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => r);
}

export type SinglePriceResult = {
  marketCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  subTypeName: string;
};

export async function fetchSinglePrice(args: {
  groupId: number;
  productId: number;
  subType?: string;
}): Promise<SinglePriceResult | null> {
  const rows = await fetchPrices(args.groupId);
  const candidates = rows.filter((r) => r.productId === args.productId);
  if (candidates.length === 0) return null;
  const preferred =
    candidates.find((r) => r.subTypeName === (args.subType ?? 'Normal')) ?? candidates[0];
  return {
    marketCents: preferred.marketPrice != null ? Math.round(preferred.marketPrice * 100) : null,
    lowCents: preferred.lowPrice != null ? Math.round(preferred.lowPrice * 100) : null,
    highCents: preferred.highPrice != null ? Math.round(preferred.highPrice * 100) : null,
    subTypeName: preferred.subTypeName,
  };
}

