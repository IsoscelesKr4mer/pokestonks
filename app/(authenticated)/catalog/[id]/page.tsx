import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { buttonVariants } from '@/components/ui/button';
import { PriceLabel } from '@/components/catalog/PriceLabel';
import { formatRelativeTime } from '@/lib/utils/time';

const VARIANT_LABEL: Record<string, string> = {
  normal: 'Normal',
  reverse_holo: 'Reverse Holo',
  holo: 'Holo',
  illustration_rare: 'Illustration Rare',
  special_illustration_rare: 'Special Illustration Rare',
  '1st_edition': '1st Edition',
  '1st_edition_holo': '1st Edition Holo',
  unlimited: 'Unlimited',
  unlimited_holo: 'Unlimited Holo',
};

function variantLabel(v: string | null): string | null {
  if (!v) return null;
  return VARIANT_LABEL[v] ?? v;
}

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

  const imageUrl = getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl });
  const isCard = item.kind === 'card';

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
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
            {item.setName && (
              <p className="text-sm text-muted-foreground">
                Pokémon · <span className="text-foreground/80">{item.setName}</span>
              </p>
            )}
            {isCard ? (
              <p className="text-sm text-muted-foreground">
                {item.rarity ?? 'Card'}
                {item.cardNumber && <span> · {item.cardNumber}</span>}
                {item.variant && <span> · {variantLabel(item.variant)}</span>}
              </p>
            ) : (
              item.productType && (
                <p className="text-sm text-muted-foreground">{item.productType} · Sealed</p>
              )
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest market price</p>
            <p className="text-3xl font-semibold tracking-tight">
              <PriceLabel cents={item.lastMarketCents ?? null} />
            </p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(item.lastMarketAt ?? null)}
            </p>
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
