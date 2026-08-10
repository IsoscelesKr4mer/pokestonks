import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const BUCKET = 'ebay-listings';
const DIR = 'eBay_assets/v2_photos';
const OUT = 'eBay_assets/v2_photo_urls.json';

async function main() {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('listBuckets failed:', listErr.message);
    process.exit(1);
  }
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      console.error('createBucket failed:', error.message);
      process.exit(1);
    }
    console.log(`created public bucket: ${BUCKET}`);
  } else {
    console.log(`bucket already exists: ${BUCKET}`);
  }

  const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const map: Record<string, string> = {};
  let ok = 0;
  for (const f of files) {
    const buf = readFileSync(join(DIR, f));
    const contentType = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
    const { error } = await supabase.storage.from(BUCKET).upload(f, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.error(`  upload failed: ${f} -> ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(f);
    map[f] = data.publicUrl;
    ok++;
  }

  writeFileSync(OUT, JSON.stringify(map, null, 2));
  console.log(`uploaded ${ok}/${files.length} files`);
  console.log(`url map written to ${OUT}`);
  const sample = Object.entries(map)[0];
  if (sample) console.log(`sample: ${sample[0]} -> ${sample[1]}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
