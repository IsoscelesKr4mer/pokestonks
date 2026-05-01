import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { NewPurchaseClient } from './NewPurchaseClient';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ catalogItemId?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.catalogItemId;

  if (!idParam) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Log a purchase</h1>
        <p className="text-sm text-muted-foreground">
          Start from a catalog item: search for what you bought, then click Log purchase.
        </p>
        <Link href="/catalog" className="inline-block text-sm underline">
          Go to search
        </Link>
      </div>
    );
  }

  const numericId = Number(idParam);
  if (!Number.isFinite(numericId)) {
    redirect('/catalog');
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    redirect('/catalog');
  }

  const catalogItem: PurchaseFormCatalogItem = {
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    lastMarketCents: item.lastMarketCents,
    packCount: item.packCount ?? null,
  };

  return <NewPurchaseClient catalogItem={catalogItem} />;
}
