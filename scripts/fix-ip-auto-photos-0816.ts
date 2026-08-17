/**
 * Replace the group shots with the correct per-card photos.
 *
 *   npx tsx scripts/fix-ip-auto-photos-0816.ts           # dry run
 *   npx tsx scripts/fix-ip-auto-photos-0816.ts --apply
 *
 * Michael: "Ooops I didnt upload the correct photos" then "there ya go now look".
 * The second upload is what he meant: one clean shot per signed card.
 *
 *   IMG_1618  Mason Peters   Blue Sapphire, signed teal   -> #51
 *   IMG_1620  Ricardo Cova   Blue Sapphire, signed teal   -> #47
 *   IMG_1623  Ricardo Cova   Yellow Sapphire 06/75        -> #240
 *   IMG_1616  Wilder Dalis   Mojo Refractor, signed purple -> #192  (already right)
 *
 * The first batch (IMG_1624-1629) were group shots of four sapphires at once.
 * They come off every card: they were the wrong upload, they cannot serve as a
 * lead image, and leaving them would mean a card's photo shows three other cards.
 * The correct shot goes FIRST so it is the lead everywhere.
 *
 * This also resolves the "no photo of the Mason Peters" flag from the first run.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';

/** the wrong upload: group shots, drop these from every card */
const GROUP_SHOTS = /bbcard_ipauto_0816_cova_(back|four_sapphires_page|blue_green_yellow_signed|spread_0[123])\.jpg$/;

const FIX: { id: number; img: number; name: string; who: string }[] = [
  { id: 51, img: 1618, name: 'bbcard_ipauto_0816_mason_peters_blue_sapphire_signed.jpg', who: 'Mason Peters Blue Sapphire' },
  { id: 47, img: 1620, name: 'bbcard_ipauto_0816_cova_blue_sapphire_signed.jpg', who: 'Ricardo Cova Blue Sapphire' },
  { id: 240, img: 1623, name: 'bbcard_ipauto_0816_cova_yellow_sapphire_75_signed.jpg', who: 'Ricardo Cova Yellow Sapphire 06/75' },
];

async function main() {
  for (const f of FIX) if (!existsSync(`${DIR}/IMG_${f.img}.JPEG`)) { console.error(`missing IMG_${f.img}`); process.exit(1); }

  const ids = [...FIX.map((f) => f.id), 192];
  const rows: any = (await sql`
    SELECT id, player, parallel, photo_urls, COALESCE(notes,'') AS notes
    FROM baseball_cards WHERE id = ANY(${ids})`).map((r: any) => ({ ...r, id: Number(r.id) }));

  console.log('planned:');
  for (const f of FIX) {
    const r = rows.find((x: any) => x.id === f.id);
    const kept = ((r.photo_urls ?? []) as string[]).filter((u) => !GROUP_SHOTS.test(u));
    console.log(`  #${f.id} ${f.who}`);
    console.log(`     ${(r.photo_urls ?? []).length} photos -> ${kept.length + 1}  (lead: IMG_${f.img})`);
  }
  const w = rows.find((x: any) => x.id === 192);
  const wKept = ((w.photo_urls ?? []) as string[]).filter((u) => !GROUP_SHOTS.test(u));
  console.log(`  #192 Wilder Dalis: ${(w.photo_urls ?? []).length} -> ${wKept.length} (keeps IMG_1616 lead, drops any group shot)`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const f of FIX) {
    const { error } = await sb.storage.from(BUCKET)
      .upload(f.name, readFileSync(`${DIR}/IMG_${f.img}.JPEG`), { contentType: 'image/jpeg', upsert: true });
    if (error) { console.error(`upload failed ${f.name}: ${error.message}`); process.exit(1); }
    if (!(await fetch(PUB + f.name, { method: 'HEAD' })).ok) { console.error(`unreachable ${f.name}`); process.exit(1); }
  }
  console.log(`\nuploaded and verified ${FIX.length} photos`);

  for (const f of FIX) {
    const r = rows.find((x: any) => x.id === f.id);
    const kept = ((r.photo_urls ?? []) as string[]).filter((u) => !GROUP_SHOTS.test(u) && u !== PUB + f.name);
    const notes = String(r.notes)
      .replace(/ NO PHOTO OF THE SIGNED CARD YET:[^]*?before this is listed or shared\./, '')
      .replace(/ Photos are group shots, not a dedicated front\/back\./, '')
      .trim() + ` Correct signed photo attached 2026-08-17 (IMG_${f.img}); the earlier group shots were the wrong upload and were removed.`;
    await sql`UPDATE baseball_cards SET
        photo_urls = ${sql.json([PUB + f.name, ...kept])},
        notes = ${notes}, updated_at = now() WHERE id = ${f.id}`;
    console.log(`  #${f.id} ${f.who} updated`);
  }
  await sql`UPDATE baseball_cards SET photo_urls = ${sql.json(wKept)}, updated_at = now() WHERE id = 192`;
  console.log('  #192 Wilder Dalis group shots removed');

  const after: any = await sql`SELECT id, player, parallel, photo_urls FROM baseball_cards WHERE id = ANY(${ids}) ORDER BY id`;
  console.log('\nafter:');
  for (const c of after) {
    const urls = (c.photo_urls as string[]) ?? [];
    const bad = urls.filter((u) => GROUP_SHOTS.test(u));
    console.log(`  #${c.id} ${c.player} [${c.parallel}] ${urls.length} photos, lead ${urls[0]?.split('/').pop()}`);
    if (bad.length) { console.error(`     still has group shots: ${bad.length}`); process.exit(1); }
  }
  console.log('  verified: no group shots left on any card');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
