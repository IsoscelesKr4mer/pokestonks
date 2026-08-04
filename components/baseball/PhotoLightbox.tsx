'use client';
import { useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

/**
 * Full-size photo viewer. Controlled by `index`: a number opens the lightbox on
 * that photo, null keeps it closed. Card scans are portrait and high-res, so the
 * image is contained rather than cropped -- the whole point is seeing detail the
 * thumbnail crops away.
 */
export function PhotoLightbox({
  photos,
  alt,
  index,
  onIndexChange,
}: {
  photos: string[];
  alt: string;
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const open = index != null && index >= 0 && index < photos.length;
  const many = photos.length > 1;

  const step = useCallback(
    (delta: number) => {
      if (index == null) return;
      onIndexChange((index + delta + photos.length) % photos.length);
    },
    [index, photos.length, onIndexChange]
  );

  // Arrow keys page between front and back. The dialog already handles Escape.
  useEffect(() => {
    if (!open || !many) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, many, step]);

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onIndexChange(null); }}>
      <DialogContent className="w-auto max-w-[min(96vw,900px)] sm:max-w-[min(96vw,900px)] p-3 gap-2">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[index]}
            alt={alt}
            className="mx-auto max-h-[82vh] w-auto max-w-full rounded-lg object-contain"
          />
          {many && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => step(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-canvas/70 text-text backdrop-blur transition hover:bg-canvas/90"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => step(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-canvas/70 text-text backdrop-blur transition hover:bg-canvas/90"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-meta truncate">{alt}</span>
          {many && (
            <span className="text-[11px] font-mono tabular-nums text-meta shrink-0">
              {index + 1} / {photos.length}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
