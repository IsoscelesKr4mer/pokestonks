import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { PriceLabel } from '@/components/catalog/PriceLabel';
import { formatRelativeTime } from '@/lib/utils/time';
import { LogPurchaseCta } from './LogPurchaseCta';

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

  const typeTag = isCard
    ? [item.rarity, variantLabel(item.variant)].filter(Boolean).join(' · ') || 'Card'
    : item.productType ?? 'Sealed';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-8">
      {/* Crumb */}
      <nav className="flex items-center gap-2 text-[11px] font-mono text-meta">
        <Link href="/catalog" className="hover:text-text transition-colors">
          CATALOG
        </Link>
        <span className="text-meta-dim">/</span>
        <span className="text-text truncate max-w-[240px]">{item.name.toUpperCase()}</span>
      </nav>

      {/* Masthead: chamber + identity */}
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Chamber */}
        <HoldingThumbnail
          name={item.name}
          kind={item.kind as 'sealed' | 'card'}
          imageUrl={imageUrl}
          imageStoragePath={item.imageStoragePath}
          exhibitTag={typeTag.toUpperCase()}
          size="lg"
        />

        {/* Identity */}
        <div className="flex flex-col gap-6">
          {/* Type tags */}
          <div className="flex flex-wrap gap-2">
            <span className="px-[10px] py-[4px] rounded-full border border-divider text-[10px] font-mono uppercase tracking-[0.12em] text-meta">
              {isCard ? 'CARD' : 'SEALED'}
            </span>
            {typeTag && (
              <span className="px-[10px] py-[4px] rounded-full border border-divider text-[10px] font-mono uppercase tracking-[0.12em] text-meta">
                {typeTag.toUpperCase()}
              </span>
            )}
            {item.setCode && (
              <span className="px-[10px] py-[4px] rounded-full border border-divider text-[10px] font-mono uppercase tracking-[0.12em] text-meta">
                {item.setCode}
              </span>
            )}
          </div>

          {/* Name */}
          <div className="grid gap-1">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15]">
              {item.name}
            </h1>
            {item.setName && (
              <p className="text-[13px] text-meta">{item.setName}</p>
            )}
          </div>

          {/* Market stat */}
          <div className="grid gap-[3px]">
            <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono">
              Market · per unit
            </div>
            <div className="text-[32px] font-semibold font-mono tabular-nums leading-none">
              <PriceLabel cents={item.lastMarketCents ?? null} />
            </div>
            <div className="text-[10px] font-mono text-meta">
              {formatRelativeTime(item.lastMarketAt ?? null)}
            </div>
          </div>

          {/* CTA */}
          <LogPurchaseCta catalogItemId={item.id} />
        </div>
      </div>

      {/* Metadata block */}
      <div className="vault-card p-5 grid gap-4">
        <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono border-b border-divider pb-3">
          Details
        </div>
        <dl className="grid gap-3">
          {item.releaseDate && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-[11px] font-mono text-meta uppercase tracking-[0.08em]">Release date</dt>
              <dd className="text-[12px] font-mono">{item.releaseDate}</dd>
            </div>
          )}
          {item.setName && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-[11px] font-mono text-meta uppercase tracking-[0.08em]">Set</dt>
              <dd className="text-[12px] font-mono">{item.setName}</dd>
            </div>
          )}
          {item.setCode && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-[11px] font-mono text-meta uppercase tracking-[0.08em]">Set code</dt>
              <dd className="text-[12px] font-mono">{item.setCode}</dd>
            </div>
          )}
          {item.tcgplayerProductId && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-[11px] font-mono text-meta uppercase tracking-[0.08em]">TCGCSV ID</dt>
              <dd className="text-[12px] font-mono">{item.tcgplayerProductId}</dd>
            </div>
          )}
          {isCard && item.cardNumber && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-[11px] font-mono text-meta uppercase tracking-[0.08em]">Card number</dt>
              <dd className="text-[12px] font-mono">{item.cardNumber}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
