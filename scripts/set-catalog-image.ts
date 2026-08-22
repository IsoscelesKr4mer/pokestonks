/**
 * Give a catalog item a vault thumbnail from any hosted photo.
 *
 * The normal thumbnail pipeline (lib/services/images.ts downloadIfMissing) only
 * works for TCGCSV-sourced rows: it bails on `!row.imageUrl`. Manually created
 * catalog items (Lorcana, Kayou, sports sealed) have image_url NULL, so nothing
 * ever fills them in and the Vault grid falls back to /placeholder.svg forever.
 *
 * This runs the same fetch -> sharp -> catalog/<id>.webp -> image_storage_path
 * pipeline against a URL you pass in, so an eBay listing photo already hosted in
 * the ebay-listings bucket can become the vault thumbnail.
 *
 * Usage:
 *   npx tsx scripts/set-catalog-image.ts <catalogItemId> <sourceUrl> [...more pairs]
 *   npx tsx scripts/set-catalog-image.ts 135073 https://.../Trove_01_front.JPEG --apply
 *
 * Without --apply it only reports what it would do.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import sharp from 'sharp';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const BUCKET = 'catalog';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const positional = args.filter((a) => a !== '--apply');
const force = args.includes('--force');

if (positional.length < 2 || positional.length % 2 !== 0) {
  console.error('Usage: npx tsx scripts/set-catalog-image.ts <catalogItemId> <sourceUrl> [...] [--apply] [--force]');
  process.exit(1);
}

type Pair = { id: number; src: string };
const pairs: Pair[] = [];
for (let i = 0; i < positional.length; i += 2) {
  const id = Number(positional[i]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`Not a catalog item id: ${positional[i]}`);
    process.exit(1);
  }
  pairs.push({ id, src: positional[i + 1] });
}

async function main() {
  for (const { id, src } of pairs) {
    const [row]: any = await sql`
      SELECT id, name, image_url, image_storage_path FROM catalog_items WHERE id=${id}`;
    if (!row) {
      console.error(`ci${id}: no such catalog item, skipped`);
      continue;
    }
    if (row.image_storage_path && !force) {
      console.log(`ci${id} ${row.name}: already has ${row.image_storage_path}, skipped (--force to replace)`);
      continue;
    }

    const res = await fetch(src, { headers: { 'User-Agent': 'pokestonks/0.1' } });
    if (!res.ok) {
      console.error(`ci${id}: source fetch failed ${res.status} ${src}`);
      continue;
    }
    const upstream = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(upstream)
      .resize({ width: 1000, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const meta = await sharp(webp).metadata();

    const objectKey = `${id}.webp`;
    const storagePath = `${BUCKET}/${objectKey}`;
    console.log(
      `ci${id} ${row.name}\n  from ${src}\n  -> ${storagePath} (${meta.width}x${meta.height}, ${(webp.length / 1024).toFixed(0)} KB)`
    );
    if (!apply) continue;

    const { error } = await supabase.storage.from(BUCKET).upload(objectKey, webp, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) {
      console.error(`  upload failed: ${error.message}`);
      continue;
    }
    await sql`UPDATE catalog_items SET image_storage_path=${storagePath} WHERE id=${id}`;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectKey);
    console.log(`  applied, public url ${data.publicUrl}`);
  }
  if (!apply) console.log('\ndry run, nothing written. Re-run with --apply.');
  await sql.end();
}

main().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
