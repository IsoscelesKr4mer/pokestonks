import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const D = 'C:/Users/Michael/AppData/Local/Temp/claude/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/d6249d3c-0281-4963-b522-3afbfde0cbd8/scratchpad';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const setFam = (s: string) => { const x = (s || '').toLowerCase(); if (x.includes('finest')) return 'finest'; if (x.includes('bowman')) return 'bowman'; if (x.includes('chrome')) return 'chrome'; return x; };
async function host(img: string) {
  const name = `bbcard_drop_${img.replace('.JPEG', '').replace('IMG_', '')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${img}`), { contentType: 'image/jpeg', upsert: true });
  if (error) { console.error('HOST FAIL', img, error.message); process.exit(1); }
  return PUB + name;
}
async function main() {
  const cat = JSON.parse(readFileSync(D + '/catalog_merged.json', 'utf8'));
  const existing = await sql`SELECT player, set_name, card_number, parallel FROM baseball_cards`;
  const exKeys = new Set(existing.map((r: any) => `${norm(r.player)}|${setFam(r.set_name || '')}|${norm(r.card_number || '')}|${norm(r.parallel || '')}`));
  let toInsert = 0, dupSkip = 0, looseBackSkip = 0, uncertain = 0;
  const plan: any[] = [];
  for (const c of cat) {
    if (c.kind === 'loose_back') { looseBackSkip++; continue; }
    const front = c.front_img, back = c.back_img;
    if (!front) { looseBackSkip++; continue; }
    const isUncertain = c.confidence === 'low';
    let parallel = c.parallel || 'base';
    if (isUncertain) { parallel = parallel.replace(/\s*\(.*$/, '').trim() + ' (CONFIRM)'; uncertain++; }
    const key = `${norm(c.player)}|${setFam(c.set_name || '')}|${norm(c.card_number || '')}|${norm(parallel)}`;
    const keyLoose = `${norm(c.player)}|${setFam(c.set_name || '')}|${norm(c.card_number || '')}|`; // any parallel same player+set+num
    if (exKeys.has(key)) { dupSkip++; continue; }
    toInsert++;
    plan.push({ player: c.player, set_name: c.set_name, card_number: c.card_number, parallel, front, back: back || null, uncertain, team: (c.notes || '').split(';')[0], firstBowman: c.is_1st_bowman });
  }
  console.log(`catalog ${cat.length} | to insert ${toInsert} | exact-dup skip ${dupSkip} | loose-back skip ${looseBackSkip} | uncertain-parallel ${uncertain}`);
  console.log('\n--- sample plan (first 8) ---');
  plan.slice(0, 8).forEach(p => console.log(`  ${p.player} | ${p.set_name} #${p.card_number} [${p.parallel}]${p.back ? '' : ' (front only)'}`));
  console.log('\n--- UNCERTAIN parallels (will ingest but HOLD from listing) ---');
  plan.filter(p => p.parallel.includes('CONFIRM')).forEach(p => console.log(`  ${p.player} #${p.card_number} [${p.parallel}]`));
  if (!APPLY) { console.log('\nDRY RUN - pass --apply to ingest'); await sql.end(); return; }

  let ins = 0;
  for (const p of plan) {
    const urls = [await host(p.front)]; if (p.back) urls.push(await host(p.back));
    const needsBack = p.back ? false : true;
    const notes = [p.firstBowman ? '1st Bowman' : '', p.parallel.includes('CONFIRM') ? 'CONFIRM PARALLEL (cataloguer unsure)' : '', p.team ? 'Team: ' + p.team.trim() : ''].filter(Boolean).join(' | ') || null;
    const year = /2025/.test(p.set_name) ? 2025 : 2026;
    await sql`INSERT INTO baseball_cards (user_id,player,set_name,year,card_number,parallel,sport,status,for_sale,needs_back_photo,photo_urls,notes)
      VALUES (${UID},${p.player},${p.set_name},${year},${p.card_number},${p.parallel},'Baseball','photographed',true,${needsBack},${sql.json(urls)},${notes})`;
    ins++;
  }
  const tot = await sql`SELECT COUNT(*)::int c FROM baseball_cards`;
  console.log(`\ninserted ${ins}; collection now ${tot[0].c}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
