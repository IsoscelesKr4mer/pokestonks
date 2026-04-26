'use client';
import Link from 'next/link';
import { PriceLabel } from './PriceLabel';

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
  name: string;
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string | null;
  variants: Array<{
    catalogItemId: number;
    variant: string;
    marketCents: number | null;
  }>;
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
  if (row.type === 'sealed') {
    return (
      <Link
        href={`/catalog/${row.catalogItemId}`}
        className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50"
      >
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.setName ?? '—'} · {row.productType ?? 'Sealed'}
          </div>
        </div>
        <PriceLabel cents={row.marketCents} className="text-sm font-medium" />
      </Link>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {row.name} · {row.cardNumber} {row.rarity ? `· ${row.rarity}` : ''}
          </div>
          <div className="text-xs text-muted-foreground">{row.setName ?? '—'}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.variants.map((v) => (
          <Link
            key={v.catalogItemId}
            href={`/catalog/${v.catalogItemId}`}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted/50"
          >
            <span>{variantLabel(v.variant)}</span>
            <span className="text-muted-foreground">
              <PriceLabel cents={v.marketCents} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
