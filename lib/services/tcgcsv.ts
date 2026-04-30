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

// Strip common TCGCSV name prefixes like "SV: ", "ME01: ", "POP: " so the
// remainder can match a Pokémon TCG API set name.
function stripGroupPrefix(name: string): string {
  return name.replace(/^[A-Z]{1,4}\d*:\s*/i, '');
}

export function findGroupBySetName(setName: string, groups: TcgcsvGroup[]): TcgcsvGroup | null {
  const target = setName.toLowerCase().trim();
  if (!target) return null;
  // 1) exact match
  let m = groups.find((g) => g.name.toLowerCase() === target);
  if (m) return m;
  // 2) stripped-prefix exact match (handles "SV: Scarlet & Violet 151" -> "Scarlet & Violet 151")
  m = groups.find((g) => stripGroupPrefix(g.name).toLowerCase() === target);
  if (m) return m;
  // 3) substring match, pick the shortest (most specific/main set)
  const candidates = groups.filter(
    (g) => g.name.toLowerCase().includes(target) || target.includes(g.name.toLowerCase())
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.name.length - b.name.length);
  return candidates[0];
}

// In-flight promise dedup. Without this, 295 concurrent search-time callers
// each trigger their own network round-trip before the first one populates
// the cache (thundering herd).
let groupFetchInflight: Promise<TcgcsvGroup[]> | null = null;

export async function getGroups(now: number = Date.now()): Promise<TcgcsvGroup[]> {
  if (groupCache && now - groupCache.fetchedAt < GROUP_CACHE_TTL_MS) {
    return groupCache.groups;
  }
  if (groupFetchInflight) return groupFetchInflight;
  groupFetchInflight = (async () => {
    try {
      const res = await fetch(`${TCGCSV_BASE}/groups`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!res.ok) throw new Error(`TCGCSV groups fetch failed: ${res.status}`);
      const body = (await res.json()) as { results: TcgcsvGroup[] };
      groupCache = { fetchedAt: now, groups: body.results };
      return body.results;
    } finally {
      groupFetchInflight = null;
    }
  })();
  return groupFetchInflight;
}

export const PACK_COUNT_BY_PRODUCT_TYPE: Record<string, number | null> = {
  'Booster Box': 36,
  'Booster Bundle': 6,
  'Elite Trainer Box': 9,
  'Build & Battle': 4,
  'Premium Collection': 6,
  'ex Box': 6,
  'Tin': 3,
  'Pin Collection': 3,
  'Collection Box': 4,
  'Collection': 4,
  'Mini Portfolio': 1,
  'Blister': 3,
  'Booster Pack': 1,
};

const SEALED_PATTERNS: Array<{ pattern: RegExp; productType: string }> = [
  { pattern: /\bElite Trainer Box\b/i, productType: 'Elite Trainer Box' },
  { pattern: /\bBooster Box\b/i, productType: 'Booster Box' },
  { pattern: /\bBooster Bundle\b/i, productType: 'Booster Bundle' },
  { pattern: /\bBooster Pack\b/i, productType: 'Booster Pack' },
  { pattern: /\bPremium Collection\b/i, productType: 'Premium Collection' },
  { pattern: /\bBuild & Battle\b/i, productType: 'Build & Battle' },
  { pattern: /\bCollection Box\b/i, productType: 'Collection Box' },
  // Mega Evolution-era special boxes ("Ascended Heroes Mega Meganium ex Box",
  // "Mega ex Boxes Case", etc.). Came after the original SEALED_PATTERNS list
  // and weren't covered, so they used to get dropped by classifySealedType.
  { pattern: /\bex Box(?:es)?\b/i, productType: 'ex Box' },
  { pattern: /\bPin Collection\b/i, productType: 'Pin Collection' },
  { pattern: /\bMini Portfolio\b/i, productType: 'Mini Portfolio' },
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
  packCount: number | null;
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
// In-flight dedup so 295 concurrent search-time callers don't all hit the
// network before any of them have populated the cache.
const productsInflight = new Map<number, Promise<TcgcsvProduct[]>>();
const pricesInflight = new Map<number, Promise<TcgcsvPriceRow[]>>();

export function __resetPerGroupCachesForTests() {
  productsCache.clear();
  pricesCache.clear();
  productsInflight.clear();
  pricesInflight.clear();
}

export async function fetchProducts(groupId: number, now: number = Date.now()): Promise<TcgcsvProduct[]> {
  const cached = productsCache.get(groupId);
  if (cached && now - cached.fetchedAt < PER_GROUP_TTL_MS) {
    return cached.data;
  }
  const existing = productsInflight.get(groupId);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const res = await fetch(`${TCGCSV_BASE}/${groupId}/products`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!res.ok) throw new Error(`tcgcsv products ${groupId} ${res.status}`);
      const body = (await res.json()) as { results: TcgcsvProduct[] };
      productsCache.set(groupId, { fetchedAt: now, data: body.results });
      return body.results;
    } finally {
      productsInflight.delete(groupId);
    }
  })();
  productsInflight.set(groupId, promise);
  return promise;
}

type RawPriceRow = {
  productId: number;
  lowPrice: number | null;
  midPrice?: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice?: number | null;
  subTypeName?: string | null;
};

export async function fetchPrices(groupId: number, now: number = Date.now()): Promise<TcgcsvPriceRow[]> {
  const cached = pricesCache.get(groupId);
  if (cached && now - cached.fetchedAt < PER_GROUP_TTL_MS) {
    return cached.data;
  }
  const existing = pricesInflight.get(groupId);
  if (existing) return existing;
  // TCGCSV serves /prices as JSON (despite the project name). Earlier code
  // tried to parse it as CSV via Papa, which silently produced empty rows
  // and made every sealed price come back null.
  const promise = (async () => {
    try {
      const res = await fetch(`${TCGCSV_BASE}/${groupId}/prices`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!res.ok) throw new Error(`tcgcsv prices ${groupId} ${res.status}`);
      const body = (await res.json()) as { results: RawPriceRow[] };
      const rows = (body.results ?? [])
        .filter((r) => r.productId != null)
        .map<TcgcsvPriceRow>((r) => ({
          productId: Number(r.productId),
          marketPrice: r.marketPrice != null ? Number(r.marketPrice) : null,
          lowPrice: r.lowPrice != null ? Number(r.lowPrice) : null,
          highPrice: r.highPrice != null ? Number(r.highPrice) : null,
          subTypeName: r.subTypeName ?? 'Normal',
        }));
      pricesCache.set(groupId, { fetchedAt: now, data: rows });
      return rows;
    } finally {
      pricesInflight.delete(groupId);
    }
  })();
  pricesInflight.set(groupId, promise);
  return promise;
}

function classifySealedType(name: string): string | null {
  for (const { pattern, productType } of SEALED_PATTERNS) {
    if (pattern.test(name)) return productType;
  }
  return null;
}

// Common shorthand for sealed product types. "etb" is what users type;
// product names contain "Elite Trainer Box" verbatim. Expanding here lets the
// AND filter still work for "151 etb" without the user typing the full phrase.
const SEALED_ABBREVIATIONS: Record<string, string[]> = {
  etb: ['elite', 'trainer', 'box'],
  bb: ['booster', 'box'],
  uvc: ['ultra', 'violet', 'collection'],
};

function tokenize(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/\s+/)) {
    if (!raw) continue;
    const expansion = SEALED_ABBREVIATIONS[raw];
    if (expansion) {
      out.push(...expansion);
    } else {
      out.push(raw);
    }
  }
  return out;
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

function matchesAllTokens(name: string, setName: string, tokens: string[]): boolean {
  const haystack = `${name} ${setName}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
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
            packCount: PACK_COUNT_BY_PRODUCT_TYPE[productType] ?? null,
            imageUrl: product.imageUrl,
            marketCents: price?.marketPrice != null ? Math.round(price.marketPrice * 100) : null,
            releaseDate: g.publishedOn ? g.publishedOn.slice(0, 10) : null,
            groupId: g.groupId,
          });
        }
      })
    )
  );

  // Require every text token to appear (AND), not just contribute to a score.
  // "ascended heroes ex box" should only match products whose name+set contain
  // all four words, otherwise an ETB scores 30 and pollutes the results.
  return results
    .filter((r) => matchesAllTokens(r.name, r.setName, tokens))
    .map((r) => ({ r, s: score(r.name, r.setName, tokens) }))
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

