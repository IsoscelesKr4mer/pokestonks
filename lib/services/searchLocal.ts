import 'server-only';
import { and, or, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import {
  applySort,
  type AnyDto,
  type CardResultDto,
  type SealedResultDto,
  type SearchKind,
  type SortBy,
  type Tokens,
  type Warning,
} from './search';
import { getImageUrl } from '@/lib/utils/images';

type LocalRow = {
  id: number;
  kind: string;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: Date | null;
  manualMarketCents: number | null;
};

// Drizzle's or() returns SQL | undefined when its args might be undefined.
// We always pass concrete expressions, so wrap to narrow the type.
function orRequired(...args: SQL[]): SQL {
  const result = or(...args);
  if (!result) throw new Error('orRequired called with no expressions');
  return result;
}

export type LocalSearchFilters = {
  setName: string | null;
  setCode: string | null;
};

// TCGCSV often prefixes group names with "SV:", "ME01:", "POP:" etc. The
// Pokémon TCG API stores the same set under the bare name. Strip the prefix
// before comparing so a sealed pack's setName lines up with its cards'.
function stripSetPrefix(name: string): string {
  return name.replace(/^[A-Z]{1,4}\d*:\s*/i, '').trim();
}

function buildConditions(
  tokens: Tokens,
  kind: SearchKind,
  filters: LocalSearchFilters
): SQL | undefined {
  const clauses: SQL[] = [];

  for (const t of tokens.text) {
    const pattern = `%${t}%`;
    clauses.push(
      orRequired(ilike(schema.catalogItems.name, pattern), ilike(schema.catalogItems.setName, pattern))
    );
  }

  if (tokens.cardNumberFull) {
    const head = tokens.cardNumberFull.split('/')[0];
    clauses.push(
      orRequired(
        eq(schema.catalogItems.cardNumber, tokens.cardNumberFull),
        ilike(schema.catalogItems.cardNumber, `${head}/%`)
      )
    );
  } else if (tokens.cardNumberPartial) {
    const n = tokens.cardNumberPartial;
    clauses.push(
      orRequired(
        eq(schema.catalogItems.cardNumber, n),
        ilike(schema.catalogItems.cardNumber, `${n}/%`)
      )
    );
  }

  if (tokens.setCode) {
    clauses.push(eq(schema.catalogItems.setCode, tokens.setCode));
  }

  if (filters.setName) {
    // Bidirectional substring (after prefix-stripping the filter): a sealed
    // pack might have setName "SV: Mega Evolution Ascended Heroes" while its
    // cards have "Ascended Heroes". Either side may contain the other.
    const term = stripSetPrefix(filters.setName);
    const pattern = `%${term}%`;
    clauses.push(
      orRequired(
        ilike(schema.catalogItems.setName, pattern),
        sql`${term} ILIKE '%' || ${schema.catalogItems.setName} || '%'`
      )
    );
  }
  if (filters.setCode) {
    clauses.push(ilike(schema.catalogItems.setCode, filters.setCode));
  }

  if (kind === 'sealed') clauses.push(eq(schema.catalogItems.kind, 'sealed'));
  else if (kind === 'card') clauses.push(eq(schema.catalogItems.kind, 'card'));

  if (clauses.length === 0) return undefined;
  return and(...clauses);
}

// Exported with the __ prefix so unit tests can exercise the row-to-DTO
// mapping without standing up a real database. Not part of the public API.
export function __rowToDto(row: LocalRow): AnyDto | null {
  const lastMarketAt = row.lastMarketAt?.toISOString() ?? null;
  const imageUrl = getImageUrl({
    imageStoragePath: row.imageStoragePath,
    imageUrl: row.imageUrl,
  });
  if (row.kind === 'sealed') {
    return {
      type: 'sealed',
      catalogItemId: row.id,
      name: row.name,
      setName: row.setName,
      setCode: row.setCode,
      productType: row.productType,
      imageUrl,
      marketCents: row.lastMarketCents,
      lastMarketAt,
      manualMarketCents: row.manualMarketCents,
    } satisfies SealedResultDto;
  }
  if (row.kind === 'card' && row.cardNumber !== null && row.variant !== null) {
    return {
      type: 'card',
      catalogItemId: row.id,
      name: row.name,
      cardNumber: row.cardNumber,
      setName: row.setName,
      setCode: row.setCode,
      rarity: row.rarity,
      variant: row.variant,
      imageUrl,
      imageStoragePath: row.imageStoragePath,
      marketCents: row.lastMarketCents,
      lastMarketAt,
      manualMarketCents: row.manualMarketCents,
    } satisfies CardResultDto;
  }
  return null;
}

export async function searchLocalCatalog(
  tokens: Tokens,
  kind: SearchKind,
  limit: number,
  sortBy: SortBy,
  filters: LocalSearchFilters = { setName: null, setCode: null }
): Promise<{ sealed: SealedResultDto[]; cards: CardResultDto[]; warnings: Warning[] }> {
  const conditions = buildConditions(tokens, kind, filters);
  if (!conditions) {
    return { sealed: [], cards: [], warnings: [] };
  }

  // Pull a generous superset (limit * 2, capped at 1000) so we can sort
  // in-memory and still leave headroom even after dropping rows the user
  // can't render (e.g., card rows missing variant/cardNumber).
  const fetchCap = Math.min(1000, limit * 2);
  const rows = (await db
    .select({
      id: schema.catalogItems.id,
      kind: schema.catalogItems.kind,
      name: schema.catalogItems.name,
      setName: schema.catalogItems.setName,
      setCode: schema.catalogItems.setCode,
      productType: schema.catalogItems.productType,
      cardNumber: schema.catalogItems.cardNumber,
      rarity: schema.catalogItems.rarity,
      variant: schema.catalogItems.variant,
      imageUrl: schema.catalogItems.imageUrl,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketCents: schema.catalogItems.lastMarketCents,
      lastMarketAt: schema.catalogItems.lastMarketAt,
      manualMarketCents: schema.catalogItems.manualMarketCents,
    })
    .from(schema.catalogItems)
    .where(conditions)
    .limit(fetchCap)) as LocalRow[];

  const dtos = rows.map(__rowToDto).filter((d): d is AnyDto => d !== null);
  const sorted = applySort(dtos, sortBy).slice(0, limit);
  const sealed: SealedResultDto[] = [];
  const cards: CardResultDto[] = [];
  for (const d of sorted) {
    if (d.type === 'sealed') sealed.push(d);
    else cards.push(d);
  }
  return { sealed, cards, warnings: [] };
}
