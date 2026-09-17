/**
 * Attach the photos to the 60 cards from the 2026-09-10 Bowman Chrome hobby
 * rip. They were filed without photo_urls because Supabase storage was over its
 * egress quota (402) all evening.
 *
 *   npx tsx scripts/backfill-bowman-photos-0910.ts          # check only
 *   npx tsx scripts/backfill-bowman-photos-0910.ts --apply
 *
 * Run it once the bucket is writable again. It needs no re-reading of the
 * photos: each row's notes already carry its front and back file numbers, put
 * there by the ingest, so this just parses them back out.
 *
 * It probes the bucket first and refuses to do anything if it is still 402,
 * because a half-finished upload run is worse than none. Originals are NOT
 * archived here; do that only after the URLs are verified.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const BUCKET = 'ebay-listings';
const DIR = 'eBay_assets/card drop';
const PUB = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const localPath = (n: string) => {
  for (const e of ['.JPG', '.JPEG', '.jpg', '.jpeg']) {
    const p = DIR + '/IMG_' + n + e;
    if (existsSync(p)) return p;
  }
  return null;
};

async function upload(n: string) {
  const p = localPath(n);
  if (!p) throw new Error('missing local original IMG_' + n);
  const name = 'bbcard_drop_' + n + '.jpg';
  const { error } = await supabase.storage.from(BUCKET)
    .upload(name, readFileSync(p), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error('upload failed ' + name + ': ' + error.message);
  return PUB + name;
}

(async () => {
  const rows: any[] = await sql`SELECT id, player, card_number, notes FROM baseball_cards
    WHERE notes LIKE '%photos pending: Supabase storage over egress quota on 2026-09-10%'
    ORDER BY id`;
  console.log(rows.length + ' rows still awaiting photos');
  if (!rows.length) { await sql.end(); return; }

  const jobs = rows.map(r => {
    const m = String(r.notes).match(/front IMG_(\d+), back IMG_(\d+)/);
    if (!m) throw new Error('row ' + r.id + ' has no front/back numbers in notes');
    return { id: r.id, label: r.player + ' ' + r.card_number, front: m[1], back: m[2] };
  });
  const missing = jobs.filter(j => !localPath(j.front) || !localPath(j.back));
  if (missing.length) {
    console.log('>>> ' + missing.length + ' rows are missing a local original, aborting:');
    missing.forEach(j => console.log('    ' + j.label + '  IMG_' + j.front + ' / IMG_' + j.back));
    await sql.end(); return;
  }
  console.log('all ' + jobs.length * 2 + ' originals present on disk');

  // Probe the bucket before touching anything.
  const probe = await fetch(PUB + 'bbcard_drop_0664.jpg');
  console.log('bucket probe: HTTP ' + probe.status);
  if (probe.status === 402) {
    console.log('Supabase storage is STILL over quota. Nothing done. Re-run after it resets or after an upgrade.');
    await sql.end(); return;
  }
  if (!APPLY) { console.log('\nbucket looks writable. Re-run with --apply to upload and attach.'); await sql.end(); return; }

  let n = 0;
  for (const j of jobs) {
    try {
      const urls = [await upload(j.front), await upload(j.back)];
      for (const u of urls) {
        const r = await fetch(u);
        if (!r.ok) throw new Error('uploaded but unreadable (' + r.status + '): ' + u);
      }
      const cleaned = sql`regexp_replace(notes, ' \\| photos pending:[^|]*$', '')`;
      await sql`UPDATE baseball_cards
        SET photo_urls = ${sql.json(urls)}, notes = ${cleaned}, updated_at = now()
        WHERE id = ${j.id}`;
      n++;
      console.log('OK  ' + j.label);
    } catch (e) {
      console.log('>>> ' + j.label + ': ' + String(e).slice(0, 160));
    }
  }
  console.log('\nattached photos to ' + n + '/' + jobs.length + ' rows');
  console.log('originals still in "' + DIR + '". Archive to eBay_assets/_originals/ only after spot-checking the gallery.');
  await sql.end();
})();
