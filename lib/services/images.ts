import 'server-only';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { createAdminClient } from '@/lib/supabase/admin';

const inflight = new Map<number, Promise<void>>();

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(row.imageUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return;

    const upstream = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(upstream).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();

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
