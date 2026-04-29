'use client';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { formatCents } from '@/lib/utils/format';
import { getImageUrl } from '@/lib/utils/images';
import type { SaleEventDto } from '@/lib/query/hooks/useSales';

type Props = {
  sale: SaleEventDto;
  onClick?: () => void;
};

export function SaleRow({ sale, onClick }: Props) {
  const { catalogItem, totals, saleDate, platform } = sale;
  const realizedPct =
    totals.matchedCostCents > 0
      ? (totals.realizedPnLCents / totals.matchedCostCents) * 100
      : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-3 rounded-md border hover:bg-muted transition-colors"
    >
      <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageUrl({
            imageStoragePath: catalogItem.imageStoragePath,
            imageUrl: catalogItem.imageUrl,
          })}
          alt={catalogItem.name}
          loading="lazy"
          className="size-full object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{catalogItem.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {saleDate} - {totals.quantity}x sold for {formatCents(totals.salePriceCents - totals.feesCents)}
          {platform ? ` - ${platform}` : ''}
        </div>
      </div>
      <PnLDisplay pnlCents={totals.realizedPnLCents} pnlPct={realizedPct} />
    </button>
  );
}
