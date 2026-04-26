import 'server-only';
import { db, schema } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export type SealedUpsertInput = {
  kind: 'sealed';
  name: string;
  setName: string | null;
  setCode: string | null;
  tcgplayerProductId: number;
  productType: string;
  imageUrl: string | null;
  releaseDate: string | null;
  // Latest market price (cents) for this product. Written to catalog_items
  // so the DB-first search can read it without a join with market_prices.
  lastMarketCents: number | null;
};

export type CardUpsertInput = {
  kind: 'card';
  name: string;
  setName: string | null;
  setCode: string | null;
  pokemonTcgCardId: string | null;
  tcgplayerSkuId: number | null;
  cardNumber: string;
  rarity: string | null;
  variant: string;
  imageUrl: string | null;
  releaseDate: string | null;
  lastMarketCents: number | null;
};

export type UpsertResult = {
  id: number;
  imageStoragePath: string | null;
  lastMarketAt: Date | null;
};

export async function upsertSealed(input: SealedUpsertInput): Promise<UpsertResult> {
  const rows = await db
    .insert(schema.catalogItems)
    .values({
      kind: 'sealed',
      name: input.name,
      setName: input.setName,
      setCode: input.setCode,
      tcgplayerProductId: input.tcgplayerProductId,
      productType: input.productType,
      imageUrl: input.imageUrl,
      releaseDate: input.releaseDate,
      lastMarketCents: input.lastMarketCents,
      lastMarketAt: sql`NOW()`,
    })
    .onConflictDoUpdate({
      target: schema.catalogItems.tcgplayerProductId,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        setCode: sql`excluded.set_code`,
        productType: sql`excluded.product_type`,
        imageUrl: sql`COALESCE(${schema.catalogItems.imageUrl}, excluded.image_url)`,
        releaseDate: sql`excluded.release_date`,
        lastMarketCents: sql`excluded.last_market_cents`,
        lastMarketAt: sql`NOW()`,
      },
    })
    .returning({
      id: schema.catalogItems.id,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketAt: schema.catalogItems.lastMarketAt,
    });
  return rows[0];
}

export async function upsertCard(input: CardUpsertInput): Promise<UpsertResult> {
  const rows = await bulkUpsertCards([input]);
  return rows[0];
}

// Bulk variant of upsertCard. Inserts up to ~500 rows in a single statement.
// PostgreSQL's RETURNING preserves input order, so the returned array maps 1:1
// onto `inputs`. The caller can index by position to attach catalogItemIds back
// to its in-memory hits.
export async function bulkUpsertCards(inputs: CardUpsertInput[]): Promise<UpsertResult[]> {
  if (inputs.length === 0) return [];
  const values = inputs.map((input) => ({
    kind: 'card' as const,
    name: input.name,
    setName: input.setName,
    setCode: input.setCode,
    pokemonTcgCardId: input.pokemonTcgCardId,
    tcgplayerSkuId: input.tcgplayerSkuId,
    cardNumber: input.cardNumber,
    rarity: input.rarity,
    variant: input.variant,
    imageUrl: input.imageUrl,
    releaseDate: input.releaseDate,
    lastMarketCents: input.lastMarketCents,
    lastMarketAt: sql`NOW()`,
  }));
  const rows = await db
    .insert(schema.catalogItems)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.catalogItems.setCode, schema.catalogItems.cardNumber, schema.catalogItems.variant],
      targetWhere: sql`kind = 'card'`,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        pokemonTcgCardId: sql`COALESCE(${schema.catalogItems.pokemonTcgCardId}, excluded.pokemon_tcg_card_id)`,
        // prefer incoming: SKU IDs can rotate; imageUrl is preserved once downloaded
        tcgplayerSkuId: sql`COALESCE(excluded.tcgplayer_sku_id, ${schema.catalogItems.tcgplayerSkuId})`,
        rarity: sql`COALESCE(excluded.rarity, ${schema.catalogItems.rarity})`,
        imageUrl: sql`COALESCE(${schema.catalogItems.imageUrl}, excluded.image_url)`,
        releaseDate: sql`excluded.release_date`,
        lastMarketCents: sql`excluded.last_market_cents`,
        lastMarketAt: sql`NOW()`,
      },
    })
    .returning({
      id: schema.catalogItems.id,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketAt: schema.catalogItems.lastMarketAt,
    });
  return rows;
}
