import 'server-only';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { createAdminClient } from '@/lib/supabase/admin';

const inflight = new Map<number, Promise<void>>();
const USER_AGENT = 'pokestonks/0.1 (+https://github.com/IsoscelesKr4mer/pokestonks)';

// TCGCSV ships the small thumbnail variant (`_200w.jpg`) which downscales
// to 200x191 webp — visibly blurry in the Vault grid. Swap to the
// `_in_1000x1000.jpg` variant which is reliably available across products
// and produces a sharp 1000x1000 source for sharp() to downscale from.
export function upgradeTcgplayerImageUrl(url: string): string {
  if (!/^https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\//.test(url)) {
    return url;
  }
  return url.replace(/_\d+w\.(jpg|png)$/i, '_in_1000x1000.jpg');
}

export function __resetInflightForTests() {
  inflight.clear();
}

export async function downloadIfMissing(catalogItemId: number): Promise<void> {
  const existing = inflight.get(catalogItemId);
  if (existing) return existing;
  const p = doDownload(catalogItemId).finally(() => inflight.delete(catalogItemId));
  inflight.set(catalogItemId, p);
  return p;
}

async function doDownload(catalogItemId: number): Promise<void> {
  try {
    const row = await db.query.catalogItems.findFirst({
      where: eq(schema.catalogItems.id, catalogItemId),
    });
    if (!row) return;
    if (row.imageStoragePath) return;
    if (!row.imageUrl) return;

    const fetchUrl = upgradeTcgplayerImageUrl(row.imageUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      // TCGCSV references CDN URLs for products that were never uploaded.
      // Clear imageUrl on 4xx so future searches stop serving the dead URL
      // (frontend renders /placeholder.svg when imageUrl is null). Leave 5xx
      // alone — those are transient and worth retrying next time.
      if (res.status >= 400 && res.status < 500) {
        await db
          .update(schema.catalogItems)
          .set({ imageUrl: null })
          .where(eq(schema.catalogItems.id, catalogItemId));
      }
      return;
    }

    const upstream = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(upstream).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();

    const objectKey = `${catalogItemId}.webp`;
    const imageStoragePath = `catalog/${objectKey}`;

    const supabase = createAdminClient();
    const { error } = await supabase.storage.from('catalog').upload(objectKey, webp, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) {
      console.error('[images.downloadIfMissing] upload failed', { catalogItemId, error });
      return;
    }

    await db
      .update(schema.catalogItems)
      .set({ imageStoragePath })
      .where(eq(schema.catalogItems.id, catalogItemId));
  } catch (err) {
    console.error('[images.downloadIfMissing] failed', { catalogItemId, err });
  }
}
