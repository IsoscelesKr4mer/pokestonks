import { searchSealed, getGroups, fetchProducts, fetchPrices, type SealedSearchHit, type TcgcsvProduct, type TcgcsvPriceRow } from './tcgcsv';
import { searchCards, type PokemonTcgCard } from './pokemontcg';
import { upsertSealed, upsertCard } from '@/lib/db/upserts/catalogItems';

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

export type SealedResult = SealedSearchHit & { catalogItemId: number };

export async function searchSealedWithImport(query: string, limit: number): Promise<SealedResult[]> {
  const hits = await searchSealed(query, limit);
  const results = await Promise.all(
    hits.map(async (h) => {
      const id = await upsertSealed({
        kind: 'sealed',
        name: h.name,
        setName: h.setName,
        setCode: h.setCode,
        tcgplayerProductId: h.tcgplayerProductId,
        productType: h.productType,
        imageUrl: h.imageUrl,
        releaseDate: h.releaseDate,
      });
      return { ...h, catalogItemId: id };
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

async function findTcgcsvCardPrice(args: {
  setCode: string | null;
  cardNumber: string;
}): Promise<{ normal?: TcgcsvPriceRow; reverseHolo?: TcgcsvPriceRow; productId?: number }> {
  if (!args.setCode) return {};
  const groups = await getGroups();
  const group = groups.find((g) => (g.abbreviation ?? '').toLowerCase() === args.setCode);
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
    return { productId: product.productId };
  }
  const rows = priceRows.filter((r) => r.productId === product.productId);
  return {
    normal: rows.find((r) => r.subTypeName === 'Normal'),
    reverseHolo: rows.find((r) => /Reverse Holofoil/i.test(r.subTypeName)),
    productId: product.productId,
  };
}

async function emitVariant(args: {
  card: PokemonTcgCard;
  variant: string;
  marketCents: number | null;
}): Promise<CardVariantHit> {
  const { card, variant, marketCents } = args;
  const id = await upsertCard({
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
  });
  return {
    catalogItemId: id,
    name: card.name,
    cardNumber: card.number,
    setName: card.setName,
    setCode: card.setCode,
    rarity: card.rarity,
    variant,
    imageUrl: card.imageUrl,
    marketCents,
  };
}

export async function searchCardsWithImport(
  query: string,
  limit: number
): Promise<{ results: CardVariantHit[]; warnings: Warning[] }> {
  const tokens = tokenizeQuery(query);
  const warnings: Warning[] = [];

  let tcgcsvAvailable = true;
  try {
    await withTimeout(getGroups());
  } catch (e) {
    tcgcsvAvailable = false;
    warnings.push({ source: 'tcgcsv', message: (e as Error).message });
  }

  let pokemonCards: PokemonTcgCard[] = [];
  try {
    pokemonCards = await withTimeout(
      searchCards({
        text: tokens.text,
        cardNumberPartial: tokens.cardNumberPartial,
        cardNumberFull: tokens.cardNumberFull,
        setCode: tokens.setCode,
        // Cap at limit*2 (or 100, whichever is bigger) so sort-by-price has a wide enough field to pick from.
        pageSize: Math.max(100, limit * 2),
      })
    );
  } catch (e) {
    warnings.push({ source: 'pokemontcg', message: (e as Error).message });
  }

  const variantArrays = await Promise.all(
    pokemonCards.map(async (card) => {
      let tcgcsvResult: Awaited<ReturnType<typeof findTcgcsvCardPrice>> = {};
      if (tcgcsvAvailable) {
        try {
          tcgcsvResult = await withTimeout(
            findTcgcsvCardPrice({ setCode: card.setCode, cardNumber: card.number })
          );
        } catch (e) {
          if (!warnings.find((w) => w.source === 'tcgcsv')) {
            warnings.push({ source: 'tcgcsv', message: (e as Error).message });
          }
        }
      }
      const out: CardVariantHit[] = [];
      out.push(
        await emitVariant({
          card,
          variant: 'normal',
          marketCents:
            tcgcsvResult.normal?.marketPrice != null
              ? Math.round(tcgcsvResult.normal.marketPrice * 100)
              : null,
        })
      );
      if (tcgcsvResult.reverseHolo) {
        out.push(
          await emitVariant({
            card,
            variant: 'reverse_holo',
            marketCents:
              tcgcsvResult.reverseHolo.marketPrice != null
                ? Math.round(tcgcsvResult.reverseHolo.marketPrice * 100)
                : null,
          })
        );
      }
      return out;
    })
  );

  return { results: variantArrays.flat(), warnings };
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

export type SortBy = 'price-desc' | 'price-asc' | 'relevance' | 'released' | 'name';

export type SearchResponse = {
  query: string;
  kind: SearchKind;
  sortBy: SortBy;
  results: Array<SealedResultDto | CardResultDto>;
  warnings: Warning[];
};

type AnyDto = SealedResultDto | CardResultDto;

function sortKey(r: AnyDto, sortBy: SortBy): number | string {
  switch (sortBy) {
    case 'price-desc':
    case 'price-asc':
      return r.marketCents ?? -1;
    case 'released':
      // We don't carry releaseDate on DTOs yet; defer to insertion order.
      return 0;
    case 'name':
      return r.name.toLowerCase();
    case 'relevance':
    default:
      return 0;
  }
}

function applySort(rows: AnyDto[], sortBy: SortBy): AnyDto[] {
  if (sortBy === 'relevance') return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const ak = sortKey(a, sortBy);
    const bk = sortKey(b, sortBy);
    // Push null/missing prices to the end regardless of direction.
    const aMissing = a.marketCents == null;
    const bMissing = b.marketCents == null;
    if ((sortBy === 'price-desc' || sortBy === 'price-asc') && aMissing !== bMissing) {
      return aMissing ? 1 : -1;
    }
    if (typeof ak === 'string' && typeof bk === 'string') {
      return ak.localeCompare(bk);
    }
    if (sortBy === 'price-asc') return (ak as number) - (bk as number);
    return (bk as number) - (ak as number);
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
