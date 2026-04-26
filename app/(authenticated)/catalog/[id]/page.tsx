import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { getOrRefreshLatestPrice } from '@/lib/services/prices';
import { buttonVariants } from '@/components/ui/button';
import { PriceLabel } from '@/components/catalog/PriceLabel';

const VARIANT_LABEL: Record<string, string> = {
  normal: 'Normal',
  reverse_holo: 'Reverse Holo',
  holo: 'Holo',
  illustration_rare: 'Illustration Rare',
  special_illustration_rare: 'Special Illustration Rare',
};

export default async function CatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) notFound();

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

  const imageUrl = getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl });
  const subtitle = item.kind === 'sealed' ? item.productType : VARIANT_LABEL[item.variant ?? 'normal'] ?? item.variant;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <Link href="/catalog" className="text-sm text-muted-foreground hover:underline">
        Back to catalog
      </Link>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
            <p className="text-sm text-muted-foreground">{subtitle ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{item.setName ?? '—'}</p>
            {item.cardNumber && <p className="text-sm text-muted-foreground">#{item.cardNumber}</p>}
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest market price</p>
            <p className="text-2xl font-semibold">
              <PriceLabel cents={latestPrice?.marketCents ?? null} />
            </p>
            {latestPrice && (
              <p className="text-xs text-muted-foreground">
                as of {latestPrice.snapshotDate}
                {latestPrice.isStale && ' · Stale'}
              </p>
            )}
          </div>

          <Link
            href={`/purchases/new?catalogItemId=${item.id}`}
            className={buttonVariants({ variant: 'default' })}
          >
            Log purchase
          </Link>
        </div>
      </div>
    </div>
  );
}
