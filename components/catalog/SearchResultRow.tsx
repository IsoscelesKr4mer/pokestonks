'use client';
import Link from 'next/link';
import { PriceLabel } from './PriceLabel';
import { QuickAddButton } from './QuickAddButton';

type SealedResult = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
  marketCents: number | null;
};

type CardResult = {
  type: 'card';
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

export type ResultRow = SealedResult | CardResult;

const VARIANT_LABEL: Record<string, string> = {
  normal: 'Normal',
  reverse_holo: 'Reverse Holo',
  holo: 'Holo',
  illustration_rare: 'Illustration Rare',
  special_illustration_rare: 'Special Illustration Rare',
  alt_art: 'Alt Art',
  hyper_rare: 'Hyper Rare',
};

function variantLabel(v: string): string {
  return VARIANT_LABEL[v] ?? v;
}

export function SearchResultRow({ row }: { row: ResultRow }) {
  const aspectClass = row.type === 'sealed' ? 'aspect-square' : 'aspect-[5/7]';
  const detailHref = `/catalog/${row.catalogItemId}`;
  const subtitle = row.setName ?? '—';
  const meta =
    row.type === 'sealed'
      ? row.productType ?? 'Sealed'
      : `${row.rarity ?? ''}${row.rarity && row.cardNumber ? ' · ' : ''}${row.cardNumber ? `#${row.cardNumber}` : ''}`;
  const variantBadge = row.type === 'card' ? variantLabel(row.variant) : 'Sealed';

  return (
    <div className="group relative flex flex-col rounded-lg border bg-card p-3">
      <Link
        href={detailHref}
        className={`relative ${aspectClass} w-full overflow-hidden rounded-md bg-muted`}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.imageUrl} alt={row.name} loading="lazy" className="size-full object-contain" />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </Link>
      <div className="mt-3 flex-1 space-y-1">
        <Link href={detailHref} className="block">
          <div className="line-clamp-2 text-sm font-semibold leading-tight">{row.name}</div>
        </Link>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
        <div className="text-xs text-muted-foreground">{meta || ' '}</div>
        <div className="text-xs text-muted-foreground">{variantBadge}</div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <PriceLabel cents={row.marketCents} className="text-sm font-semibold tabular-nums" />
        <QuickAddButton catalogItemId={row.catalogItemId} fallbackCents={row.marketCents} />
      </div>
    </div>
  );
}
