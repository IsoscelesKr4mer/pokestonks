import { searchSealed, getGroups, fetchProducts, fetchPrices, type SealedSearchHit, type TcgcsvProduct, type TcgcsvPriceRow } from './tcgcsv';
import { upsertSealed } from '@/lib/db/upserts/catalogItems';

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

import { searchCards, type PokemonTcgCard } from './pokemontcg';
import { upsertCard } from '@/lib/db/upserts/catalogItems';

export type CardVariantResult = {
  catalogItemId: number;
  variant: string;
  marketCents: number | null;
  tcgplayerSkuId: number | null;
};

export type CardResult = {
  name: string;
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string | null;
  variants: CardVariantResult[];
};

export type Warning = { source: 'tcgcsv' | 'pokemontcg'; message: string };

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

export async function searchCardsWithImport(
  query: string,
  limit: number
): Promise<{ results: CardResult[]; warnings: Warning[] }> {
  const tokens = tokenizeQuery(query);
  const warnings: Warning[] = [];

  // Probe tcgcsv groups early so we always collect a warning if it's down,
  // even if pokemontcg also fails and we end up with no cards to enrich.
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
        pageSize: 50,
      })
    );
  } catch (e) {
    warnings.push({ source: 'pokemontcg', message: (e as Error).message });
  }

  const enriched = await Promise.all(
    pokemonCards.slice(0, limit).map(async (card) => {
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
      const variants: CardVariantResult[] = [];
      const normalCatalogId = await upsertCard({
        kind: 'card',
        name: card.name,
        setName: card.setName,
        setCode: card.setCode,
        pokemonTcgCardId: card.cardId,
        tcgplayerSkuId: null,
        cardNumber: card.number,
        rarity: card.rarity,
        variant: 'normal',
        imageUrl: card.imageUrl,
        releaseDate: card.releaseDate,
      });
      variants.push({
        catalogItemId: normalCatalogId,
        variant: 'normal',
        marketCents:
          tcgcsvResult.normal?.marketPrice != null
            ? Math.round(tcgcsvResult.normal.marketPrice * 100)
            : null,
        tcgplayerSkuId: null,
      });
      if (tcgcsvResult.reverseHolo) {
        const reverseId = await upsertCard({
          kind: 'card',
          name: card.name,
          setName: card.setName,
          setCode: card.setCode,
          pokemonTcgCardId: card.cardId,
          tcgplayerSkuId: null,
          cardNumber: card.number,
          rarity: card.rarity,
          variant: 'reverse_holo',
          imageUrl: card.imageUrl,
          releaseDate: card.releaseDate,
        });
        variants.push({
          catalogItemId: reverseId,
          variant: 'reverse_holo',
          marketCents:
            tcgcsvResult.reverseHolo.marketPrice != null
              ? Math.round(tcgcsvResult.reverseHolo.marketPrice * 100)
              : null,
          tcgplayerSkuId: null,
        });
      }
      return {
        name: card.name,
        cardNumber: card.number,
        setName: card.setName,
        setCode: card.setCode,
        rarity: card.rarity,
        imageUrl: card.imageUrl,
        variants,
      } satisfies CardResult;
    })
  );

  return { results: enriched, warnings };
}

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
