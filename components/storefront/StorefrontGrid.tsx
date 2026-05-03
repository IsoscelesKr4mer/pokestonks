import Image from 'next/image';
import { formatCents } from '@/lib/utils/format';
import { getImageUrl } from '@/lib/utils/images';
import type { StorefrontViewItem } from '@/lib/services/storefront';

export type StorefrontGridProps = {
  items: StorefrontViewItem[];
};

export function StorefrontGrid({ items }: StorefrontGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const src = getImageUrl({
          imageStoragePath: item.imageStoragePath,
          imageUrl: item.imageUrl,
        });
        return (
          <article
            key={item.catalogItemId}
            className="rounded-xl border border-divider bg-vault p-4 flex flex-col"
          >
            <div className="aspect-square w-full mb-3 rounded-lg overflow-hidden bg-canvas flex items-center justify-center">
              {src ? (
                <Image
                  src={src}
                  alt={item.name}
                  width={400}
                  height={400}
                  className="object-contain w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="text-meta text-[24px]">📦</div>
              )}
            </div>
            <h2 className="text-[14px] font-medium leading-tight line-clamp-2">{item.name}</h2>
            <p className="mt-1 text-[12px] text-meta">
              {[item.setName, item.typeLabel].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-[18px] font-semibold tracking-tight">
                {formatCents(item.askingPriceCents ?? 0)}
              </p>
              <p className="text-[11px] text-meta">
                {item.qtyAvailable} {item.qtyAvailable === 1 ? 'available' : 'available'}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
