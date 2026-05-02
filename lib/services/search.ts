import pLimit from 'p-limit';
import {
  searchSealed,
  getGroups,
  fetchProducts,
  fetchPrices,
  findGroupBySetName,
  type SealedSearchHit,
  type TcgcsvProduct,
  type TcgcsvPriceRow,
} from './tcgcsv';
import { searchCards, type PokemonTcgCard } from './pokemontcg';
import { upsertSealed, bulkUpsertCards, type CardUpsertInput } from '@/lib/db/upserts/catalogItems';
import { getImageUrl } from '@/lib/utils/images';

// Cap concurrent DB upserts so a 250-card set search doesn't exhaust the
// connection pool or hit a function timeout.
const UPSERT_LIMIT = pLimit(10);

export type Tokens = {
  text: string[];
  cardNumberFull: string | null;
  cardNumberPartial: string | null;
  setCode: string | null;
};

const RE_CARD_FULL = /^\d+\/\d+$/;
const RE_CARD_PARTIAL = /^\d{1,3}$/;
const RE_SET_CODE = /^[a-z]{2,4}\d+(?:pt\d+)?$/i;

export function tokenizeQuery(q: string): Tokens {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const out: Tokens = { text: [], cardNumberFull: null, cardNumberPartial: null, setCode: null };
  for (const t of tokens) {
    if (RE_CARD_FULL.test(t)) {
      out.cardNumberFull = t;
    } else if (RE_CARD_PARTIAL.test(t)) {
      out.cardNumberPartial = t;
    } else if (RE_SET_CODE.test(t)) {
      out.setCode = t;
    } else {
      out.text.push(t);
    }
  }
  return out;
}

export type Warning = { source: 'tcgcsv' | 'pokemontcg'; message: string };

export type SealedResult = SealedSearchHit & {
  catalogItemId: number;
  imageStoragePath: string | null;
  lastMarketAt: string | null;
  manualMarketCents: number | null;
};

export async function searchSealedWithImport(query: string, limit: number): Promise<SealedResult[]> {
  const hits = await searchSealed(query, limit);
  const results = await Promise.all(
    hits.map(async (h) => {
      const upserted = await UPSERT_LIMIT(() =>
        upsertSealed({
          kind: 'sealed',
          name: h.name,
          setName: h.setName,
          setCode: h.setCode,
          tcgplayerProductId: h.tcgplayerProductId,
          productType: h.productType,
          packCount: h.packCount,
          imageUrl: h.imageUrl,
          releaseDate: h.releaseDate,
          lastMarketCents: h.marketCents,
        })
      );
      // Use the cached storage URL when one exists (faster than upstream).
      const resolvedImageUrl = getImageUrl({
        imageStoragePath: upserted.imageStoragePath,
        imageUrl: h.imageUrl,
      });
      return {
        ...h,
        catalogItemId: upserted.id,
        imageUrl: resolvedImageUrl,
        imageStoragePath: upserted.imageStoragePath,
        lastMarketAt: upserted.lastMarketAt?.toISOString() ?? null,
        manualMarketCents: upserted.manualMarketCents,
      };
    })
  );
  return results;
}

export type CardVariantHit = {
  catalogItemId: number;
  name: string;
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  variant: string;
  imageUrl: string | null;
  imageStoragePath: string | null;
  marketCents: number | null;
  lastMarketAt: string | null;
  manualMarketCents: number | null;
};

// Vercel Hobby has a 10s function budget. Pokémon TCG API parallel pagination
// for a 295-card set legitimately takes 4-5s; bulk upsert + framework adds
// another ~1s. Anything under 8s here leaves headroom for cold start.
const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error('upstream timeout')), TIMEOUT_MS)
    ),
  ]);
}

// Map Pokémon TCG API tcgplayer.prices keys to our internal variant strings.
// Anything we don't explicitly know about flows through as-is (snake-cased).
function normalizePokeTcgVariantKey(key: string): string {
  switch (key) {
    case 'normal':
      return 'normal';
    case 'holofoil':
      return 'holo';
    case 'reverseHolofoil':
      return 'reverse_holo';
    case '1stEditionHolofoil':
      return '1st_edition_holo';
    case '1stEdition':
      return '1st_edition';
    case 'unlimitedHolofoil':
      return 'unlimited_holo';
    case 'unlimited':
      return 'unlimited';
    default:
      return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  }
}

// TCGCSV uses subTypeName strings ("Normal", "Holofoil", "Reverse Holofoil",
// "1st Edition Holofoil", etc.). Map to the same internal variants as above
// so prices from either source can merge.
function normalizeTcgcsvSubType(subType: string): string {
  const s = subType.trim().toLowerCase();
  if (s === 'normal') return 'normal';
  if (s === 'holofoil' || s === 'holo') return 'holo';
  if (s.includes('reverse')) return 'reverse_holo';
  if (s.includes('1st edition') && s.includes('holo')) return '1st_edition_holo';
  if (s.includes('1st edition')) return '1st_edition';
  if (s.includes('unlimited') && s.includes('holo')) return 'unlimited_holo';
  if (s.includes('unlimited')) return 'unlimited';
  return s.replace(/\s+/g, '_');
}

function stripLeadingZeros(s: string): string {
  // Purely numeric: strip leading zeros so "057" === "57". Alphanumeric
  // (e.g. "SWSH001"): leave alone, the prefix carries meaning.
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

// Look up a card on TCGCSV by its Pokémon TCG API set name + card number.
// Returns prices keyed by our internal variant strings, in cents.
async function findTcgcsvCardPrices(args: {
  setName: string | null;
  cardNumber: string;
}): Promise<Record<string, number | null>> {
  if (!args.setName) return {};
  let groups;
  try {
    groups = await getGroups();
  } catch {
    return {};
  }
  const group = findGroupBySetName(args.setName, groups);
  if (!group) return {};
  let products: TcgcsvProduct[];
  try {
    products = await fetchProducts(group.groupId);
  } catch {
    return {};
  }
  // Pokémon TCG API stores card numbers unpadded ("55", "57"); TCGCSV
  // stores them zero-padded to the set width ("055/217", "057/217").
  // Naive startsWith() only matched when the digit count happened to line
  // up — i.e. cards numbered >=100 in a 3-digit-padded set worked, but
  // 1-99 silently missed. Strip leading zeros from both sides before
  // comparing, with an alphanumeric fallback for promo-style numbers
  // ("TG01", "SWSH001") where stripping might lose information.
  const target = stripLeadingZeros(args.cardNumber);
  const product = products.find((p) => {
    const num = (p.extendedData ?? []).find((d) => d.name === 'Number')?.value;
    if (!num) return false;
    const head = num.split('/')[0];
    return stripLeadingZeros(head) === target;
  });
  if (!product) return {};
  let priceRows: TcgcsvPriceRow[];
  try {
    priceRows = await fetchPrices(group.groupId);
  } catch {
    return {};
  }
  const out: Record<string, number | null> = {};
  for (const r of priceRows) {
    if (r.productId !== product.productId) continue;
    const variant = normalizeTcgcsvSubType(r.subTypeName);
    out[variant] = r.marketPrice != null ? Math.round(r.marketPrice * 100) : null;
  }
  return out;
}

type PendingVariant = {
  card: PokemonTcgCard;
  variant: string;
  marketCents: number | null;
};

function pendingToInput(p: PendingVariant): CardUpsertInput {
  return {
    kind: 'card',
    name: p.card.name,
    setName: p.card.setName,
    setCode: p.card.setCode,
    pokemonTcgCardId: p.card.cardId,
    tcgplayerSkuId: null,
    cardNumber: p.card.number,
    rarity: p.card.rarity,
    variant: p.variant,
    imageUrl: p.card.imageUrl,
    releaseDate: p.card.releaseDate,
    lastMarketCents: p.marketCents,
  };
}

export async function searchCardsWithImport(
  query: string,
  limit: number
): Promise<{ results: CardVariantHit[]; warnings: Warning[] }> {
  const tokens = tokenizeQuery(query);
  const warnings: Warning[] = [];

  let pokemonCards: PokemonTcgCard[] = [];
  try {
    pokemonCards = await withTimeout(
      searchCards({
        text: tokens.text,
        cardNumberPartial: tokens.cardNumberPartial,
        cardNumberFull: tokens.cardNumberFull,
        setCode: tokens.setCode,
        // 250 is the Pokémon TCG API max. Set queries (e.g. "ascended heroes")
        // can return ~300 cards; we cover most sets in a single page and let
        // sort-by-price work on the full field.
        pageSize: 250,
      })
    );
  } catch (e) {
    warnings.push({ source: 'pokemontcg', message: (e as Error).message });
  }

  // When the user typed a full XXX/YYY card number, narrow further. The
  // upstream API only filtered by the head ("002" → also matches stripped
  // "2"); we still need to filter by set total and printing-convention era.
  if (tokens.cardNumberFull) {
    const head = tokens.cardNumberFull.split('/')[0];
    const slashRight = tokens.cardNumberFull.split('/')[1];
    const targetTotal = Number.parseInt(slashRight ?? '', 10);

    // 1. Set printed total must match (drops cards in non-132 sets when user
    //    typed "002/132").
    if (Number.isFinite(targetTotal)) {
      pokemonCards = pokemonCards.filter(
        (c) => c.setPrintedTotal === targetTotal
      );
    }

    // 2. Leading-zero discriminator. If the user typed the head with a
    //    leading zero ("002/132"), they're using the modern (Sword & Shield
    //    era 2020+ and later) printing convention. Keep only cards whose
    //    sets carry a `regulationMark`, which is essentially perfectly
    //    correlated with leading-zero printing. This is what excludes Gym
    //    Heroes Blaine's Charizard (`gym1-2`, no regulationMark, prints as
    //    "2/132") while keeping Mega Evolution Ivysaur (`me1-2`,
    //    regulationMark "I", prints as "002/132").
    if (head.startsWith('0')) {
      pokemonCards = pokemonCards.filter((c) => c.regulationMark != null);
    }
  }

  // Merge prices from two sources (TCGCSV preferred for freshness, Pokémon
  // TCG API embedded as fallback). TCGCSV is matched by set name (case-
  // insensitive substring + prefix-stripping) since group abbreviations
  // don't line up with Pokémon TCG API set IDs.
  // Step 1: fetch TCGCSV prices for every card, then build a flat list of
  // (card, variant, marketCents) we'll need to upsert.
  const perCardPrices = await Promise.all(
    pokemonCards.map(async (card) => {
      let tcgcsvPrices: Record<string, number | null> = {};
      try {
        tcgcsvPrices = await withTimeout(
          findTcgcsvCardPrices({ setName: card.setName, cardNumber: card.number })
        );
      } catch (e) {
        if (!warnings.find((w) => w.source === 'tcgcsv')) {
          warnings.push({ source: 'tcgcsv', message: (e as Error).message });
        }
      }
      const merged: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(card.pricesByVariant)) {
        merged[normalizePokeTcgVariantKey(k)] = v;
      }
      for (const [k, v] of Object.entries(tcgcsvPrices)) {
        if (v != null) merged[k] = v;
      }
      return { card, merged };
    })
  );

  const pending: PendingVariant[] = [];
  for (const { card, merged } of perCardPrices) {
    const variantKeys = Object.keys(merged);
    if (variantKeys.length === 0) {
      // No data anywhere yet. Emit a single 'normal' row so the card still
      // surfaces; rarity-rank fallback drives sort.
      pending.push({ card, variant: 'normal', marketCents: null });
    } else {
      for (const key of variantKeys) {
        pending.push({ card, variant: key, marketCents: merged[key] });
      }
    }
  }

  // Step 2: bulk-upsert all variants in a single SQL statement instead of
  // N round trips. PostgreSQL preserves RETURNING order, so we can zip the
  // upsert results back onto `pending` by index.
  let upsertResults: Awaited<ReturnType<typeof bulkUpsertCards>> = [];
  try {
    upsertResults = await bulkUpsertCards(pending.map(pendingToInput));
  } catch (err) {
    console.error('[searchCardsWithImport] bulk upsert failed', err);
    return { results: [], warnings };
  }

  const results: CardVariantHit[] = pending.map((p, i) => {
    const upserted = upsertResults[i];
    return {
      catalogItemId: upserted.id,
      name: p.card.name,
      cardNumber: p.card.number,
      setName: p.card.setName,
      setCode: p.card.setCode,
      rarity: p.card.rarity,
      variant: p.variant,
      imageUrl: getImageUrl({ imageStoragePath: upserted.imageStoragePath, imageUrl: p.card.imageUrl }),
      imageStoragePath: upserted.imageStoragePath,
      marketCents: p.marketCents,
      lastMarketAt: upserted.lastMarketAt?.toISOString() ?? null,
      manualMarketCents: upserted.manualMarketCents,
    };
  });

  return { results, warnings };
}

export type SearchKind = 'all' | 'sealed' | 'card';

export type SealedResultDto = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  imageUrl: string | null;
  marketCents: number | null;
  lastMarketAt: string | null;
  manualMarketCents: number | null;
};

export type CardResultDto = { type: 'card' } & CardVariantHit & { lastMarketAt: string | null };

export type SortBy = 'price-desc' | 'price-asc' | 'rarity-desc' | 'relevance' | 'released' | 'name';

// When prices are missing (e.g. brand new sets that TCGplayer hasn't indexed),
// fall back to rarity to keep the sort meaningful. Sealed gets a mid rank so
// it interleaves between rare singles and common singles.
function rarityRank(r: SealedResultDto | CardResultDto): number {
  if (r.type === 'sealed') return 3;
  const rarity = r.rarity?.toLowerCase() ?? '';
  if (rarity.includes('special illustration')) return 12;
  if (rarity.includes('hyper rare') || rarity.includes('rare secret')) return 11;
  if (rarity.includes('illustration rare')) return 10;
  if (rarity.includes('ultra')) return 9;
  if (rarity.includes('alt art') || rarity.includes('full art')) return 8;
  if (rarity.includes('double rare')) return 7;
  if (rarity.includes('holo rare') || rarity.includes('rare holo')) return 6;
  if (rarity.includes('holo')) return 5;
  if (rarity === 'rare') return 4;
  if (rarity === 'uncommon') return 2;
  if (rarity === 'common') return 1;
  return 0;
}

export type SearchResponse = {
  query: string;
  kind: SearchKind;
  sortBy: SortBy;
  results: Array<SealedResultDto | CardResultDto>;
  warnings: Warning[];
};

export type AnyDto = SealedResultDto | CardResultDto;

export function applySort(rows: AnyDto[], sortBy: SortBy): AnyDto[] {
  if (sortBy === 'relevance') return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
    if (sortBy === 'released') return 0;
    if (sortBy === 'rarity-desc') {
      const rDiff = rarityRank(b) - rarityRank(a);
      if (rDiff !== 0) return rDiff;
      // Within same rarity, higher price first.
      const aPrice = a.marketCents ?? -1;
      const bPrice = b.marketCents ?? -1;
      if (aPrice !== bPrice) return bPrice - aPrice;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
    // price-desc / price-asc: priced items first, then by price, then rarity tiebreak.
    const aHasPrice = a.marketCents != null;
    const bHasPrice = b.marketCents != null;
    if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
    if (aHasPrice && bHasPrice && a.marketCents !== b.marketCents) {
      return sortBy === 'price-asc'
        ? (a.marketCents as number) - (b.marketCents as number)
        : (b.marketCents as number) - (a.marketCents as number);
    }
    // Tied (or both missing): fall back to rarity rank desc, then name asc.
    const rDiff = rarityRank(b) - rarityRank(a);
    if (rDiff !== 0) return rDiff;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return sorted;
}

export async function searchAll(
  query: string,
  kind: SearchKind,
  limit: number,
  sortBy: SortBy = 'price-desc'
): Promise<SearchResponse> {
  const warnings: Warning[] = [];
  const tasks: Array<Promise<unknown>> = [];

  let sealed: SealedResult[] = [];
  let cards: { results: CardVariantHit[]; warnings: Warning[] } = { results: [], warnings: [] };

  // Each source fetches up to `limit` so combined we have enough to sort and slice.
  if (kind === 'sealed' || kind === 'all') {
    tasks.push(
      searchSealedWithImport(query, limit)
        .then((r) => {
          sealed = r;
        })
        .catch((e: Error) => {
          warnings.push({ source: 'tcgcsv', message: e.message });
        })
    );
  }
  if (kind === 'card' || kind === 'all') {
    tasks.push(
      searchCardsWithImport(query, limit)
        .then((r) => {
          cards = r;
          warnings.push(...r.warnings);
        })
        .catch((e: Error) => {
          warnings.push({ source: 'pokemontcg', message: e.message });
        })
    );
  }

  await Promise.all(tasks);

  const sealedDtos: SealedResultDto[] = sealed.map((s) => ({
    type: 'sealed',
    catalogItemId: s.catalogItemId,
    name: s.name,
    setName: s.setName,
    setCode: s.setCode,
    productType: s.productType,
    imageUrl: s.imageUrl,
    marketCents: s.marketCents,
    lastMarketAt: s.lastMarketAt,
    manualMarketCents: s.manualMarketCents,
  }));
  const cardDtos: CardResultDto[] = cards.results.map((c) => ({ type: 'card' as const, ...c }));

  let combined: AnyDto[];
  if (sortBy === 'relevance') {
    // Original interleave behavior: alternate sealed/card by rank.
    combined = [];
    let i = 0;
    while (combined.length < limit && (i < sealedDtos.length || i < cardDtos.length)) {
      if (i < sealedDtos.length) combined.push(sealedDtos[i]);
      if (combined.length < limit && i < cardDtos.length) combined.push(cardDtos[i]);
      i++;
    }
  } else {
    combined = applySort([...sealedDtos, ...cardDtos], sortBy).slice(0, limit);
  }

  return { query, kind, sortBy, results: combined, warnings };
}
