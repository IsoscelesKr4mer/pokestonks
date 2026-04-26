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
import { upsertSealed, upsertCard } from '@/lib/db/upserts/catalogItems';
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
          imageUrl: h.imageUrl,
          releaseDate: h.releaseDate,
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
};

const TIMEOUT_MS = 5000;

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
  const product = products.find((p) => {
    const num = (p.extendedData ?? []).find((d) => d.name === 'Number')?.value;
    return num?.startsWith(`${args.cardNumber}/`);
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

async function emitVariant(args: {
  card: PokemonTcgCard;
  variant: string;
  marketCents: number | null;
}): Promise<CardVariantHit | null> {
  const { card, variant, marketCents } = args;
  try {
    const upserted = await UPSERT_LIMIT(() =>
      upsertCard({
        kind: 'card',
        name: card.name,
        setName: card.setName,
        setCode: card.setCode,
        pokemonTcgCardId: card.cardId,
        tcgplayerSkuId: null,
        cardNumber: card.number,
        rarity: card.rarity,
        variant,
        imageUrl: card.imageUrl,
        releaseDate: card.releaseDate,
      })
    );
    const resolvedImageUrl = getImageUrl({
      imageStoragePath: upserted.imageStoragePath,
      imageUrl: card.imageUrl,
    });
    return {
      catalogItemId: upserted.id,
      name: card.name,
      cardNumber: card.number,
      setName: card.setName,
      setCode: card.setCode,
      rarity: card.rarity,
      variant,
      imageUrl: resolvedImageUrl,
      imageStoragePath: upserted.imageStoragePath,
      marketCents,
    };
  } catch (err) {
    console.error('[search.emitVariant] upsert failed', { card: card.cardId, variant, err });
    return null;
  }
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

  // Merge prices from two sources (TCGCSV preferred for freshness, Pokémon
  // TCG API embedded as fallback). TCGCSV is matched by set name (case-
  // insensitive substring + prefix-stripping) since group abbreviations
  // don't line up with Pokémon TCG API set IDs.
  const variantArrays = await Promise.all(
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
      // Seed with Pokémon TCG API's embedded prices (already in cents).
      for (const [k, v] of Object.entries(card.pricesByVariant)) {
        merged[normalizePokeTcgVariantKey(k)] = v;
      }
      // Overlay with TCGCSV (preferred when available).
      for (const [k, v] of Object.entries(tcgcsvPrices)) {
        if (v != null) merged[k] = v;
      }

      const variantKeys = Object.keys(merged);
      const out: Array<CardVariantHit | null> = [];
      if (variantKeys.length === 0) {
        // No data anywhere yet. Emit a single 'normal' row so the card still
        // surfaces; rarity-rank fallback drives sort.
        out.push(await emitVariant({ card, variant: 'normal', marketCents: null }));
      } else {
        for (const key of variantKeys) {
          out.push(
            await emitVariant({
              card,
              variant: key,
              marketCents: merged[key],
            })
          );
        }
      }
      return out;
    })
  );

  const flat = variantArrays.flat().filter((v): v is CardVariantHit => v !== null);
  return { results: flat, warnings };
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
};

export type CardResultDto = { type: 'card' } & CardVariantHit;

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

type AnyDto = SealedResultDto | CardResultDto;

function applySort(rows: AnyDto[], sortBy: SortBy): AnyDto[] {
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
