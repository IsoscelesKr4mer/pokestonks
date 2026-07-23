import { getImageUrl } from '@/lib/utils/images';
import type { BaseballCardRow } from '@/lib/query/hooks/useBaseballCards';

// Resolve the lead photo for a card. Returns null when the card has no image
// yet, so the UI can show the "No photo yet" placeholder (the needs-photos cue).
export function leadPhoto(card: Pick<BaseballCardRow, 'photo_urls' | 'image_storage_path'>): string | null {
  if (Array.isArray(card.photo_urls) && card.photo_urls.length > 0) {
    return card.photo_urls[0];
  }
  if (card.image_storage_path) {
    return getImageUrl({ imageStoragePath: card.image_storage_path });
  }
  return null;
}
