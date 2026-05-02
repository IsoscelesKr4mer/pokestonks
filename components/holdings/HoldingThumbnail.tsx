'use client';
import { getImageUrl } from '@/lib/utils/images';

export interface HoldingThumbnailProps {
  name: string;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  exhibitTag?: string;
  stale?: boolean;
  ownedQty?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function HoldingThumbnail({
  name,
  kind,
  imageUrl,
  imageStoragePath,
  exhibitTag,
  stale,
  ownedQty,
  size = 'md',
  className,
  children,
}: HoldingThumbnailProps) {
  const aspect = kind === 'sealed' ? 'aspect-square' : 'aspect-[5/7]';
  const radius = size === 'lg' ? 'rounded-2xl' : 'rounded-xl';
  return (
    <div
      className={[
        'relative overflow-hidden border border-divider',
        aspect,
        radius,
        'bg-chamber',
        '[background-image:radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.06),transparent_65%)]',
        className ?? '',
      ].join(' ')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getImageUrl({ imageStoragePath, imageUrl })}
        alt={name}
        loading="lazy"
        // TCGCSV references CDN URLs for products that were never uploaded
        // (CloudFront 403s on missing S3 keys). Swap to the placeholder so
        // the grid shows a clean chamber instead of the broken-image icon.
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith('/placeholder.svg')) return;
          img.src = '/placeholder.svg';
        }}
        className="size-full object-contain"
      />
      {exhibitTag && (
        <span className="absolute top-2 left-2 px-2 py-[3px] rounded-full text-[9px] uppercase tracking-[0.14em] font-mono bg-canvas/70 backdrop-blur-md border border-white/10 text-text-muted">
          {exhibitTag}
        </span>
      )}
      {stale && (
        <span
          aria-label="Stale price"
          className="absolute bottom-2 right-2 size-[18px] rounded-full bg-canvas/70 backdrop-blur-md border border-stale/40 text-stale text-[10px] flex items-center justify-center font-mono"
        >
          !
        </span>
      )}
      {!!ownedQty && ownedQty > 0 && (
        <span className="absolute bottom-2 left-2 px-2 py-[3px] rounded-full text-[9px] uppercase tracking-[0.12em] font-mono bg-positive/10 backdrop-blur-md border border-positive/35 text-positive font-semibold">
          Owned · {ownedQty}
        </span>
      )}
      {children}
    </div>
  );
}
