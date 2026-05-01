'use client';
import Link from 'next/link';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { QuickAddButton } from './QuickAddButton';
import { ManualPriceBadge } from '@/components/prices/ManualPriceBadge';
import { formatCents } from '@/lib/utils/format';

export interface SearchResultItem {
  id: number;
  name: string;
  kind: 'sealed' | 'card';
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  rarity: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  stale: boolean;
  manualMarketCents: number | null;
}

export function SearchResultCard({
  item,
  ownedQty,
}: {
  item: SearchResultItem;
  ownedQty: number;
}) {
  const tag =
    item.kind === 'sealed'
      ? item.productType
      : 'Card · ' + (item.rarity ?? '');

  return (
    <div className="vault-card p-[10px] grid gap-2 relative">
      <Link href={`/catalog/${item.id}`} className="grid gap-2">
        <HoldingThumbnail
          name={item.name}
          kind={item.kind}
          imageUrl={item.imageUrl}
          imageStoragePath={item.imageStoragePath}
          exhibitTag={tag?.toUpperCase()}
          stale={item.stale}
          ownedQty={ownedQty}
        />
        <div className="grid gap-[2px]">
          <div className="text-[12px] font-semibold leading-[1.3] truncate">{item.name}</div>
          <div className="text-[9px] font-mono text-meta uppercase tracking-[0.04em]">
            {item.setCode ?? '-'} · {item.kind === 'sealed' ? 'SEALED' : 'CARD'}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-[1fr_auto] gap-[6px] items-center pt-2 border-t border-divider">
        <div className="grid gap-0">
          <div className="text-[8px] uppercase tracking-[0.14em] text-meta font-mono">
            Market{item.stale ? ' · stale' : ''}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <div
              className={`text-[15px] font-semibold font-mono tabular-nums leading-[1.2] ${
                item.stale ? 'text-stale' : ''
              }`}
            >
              {item.lastMarketCents !== null ? (
                formatCents(item.lastMarketCents)
              ) : (
                <span className="text-meta">--</span>
              )}
            </div>
            {item.manualMarketCents != null && (
              <ManualPriceBadge setAt={null} />
            )}
          </div>
        </div>
        <QuickAddButton catalogItemId={item.id} />
      </div>
    </div>
  );
}
