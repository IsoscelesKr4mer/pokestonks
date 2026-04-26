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
};

export type UpsertResult = { id: number; imageStoragePath: string | null };

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
      },
    })
    .returning({ id: schema.catalogItems.id, imageStoragePath: schema.catalogItems.imageStoragePath });
  return rows[0];
}

export async function upsertCard(input: CardUpsertInput): Promise<UpsertResult> {
  const rows = await db
    .insert(schema.catalogItems)
    .values({
      kind: 'card',
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
    })
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
      },
    })
    .returning({ id: schema.catalogItems.id, imageStoragePath: schema.catalogItems.imageStoragePath });
  return rows[0];
}
