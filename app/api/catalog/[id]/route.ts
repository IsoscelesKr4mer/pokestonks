import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { getOrRefreshLatestPrice } from '@/lib/services/prices';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Fire-and-forget image download.
  if (!item.imageStoragePath) {
    void downloadIfMissing(item.id);
  }

  const latestPrice = await getOrRefreshLatestPrice({
    id: item.id,
    kind: item.kind,
    setCode: item.setCode,
    cardNumber: item.cardNumber,
    tcgplayerProductId: item.tcgplayerProductId ?? null,
  });

  return NextResponse.json({
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    setCode: item.setCode,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    latestPrice,
  });
}
