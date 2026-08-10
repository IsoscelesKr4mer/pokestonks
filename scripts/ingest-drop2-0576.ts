import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function host(img: string) {
  const name = `bbcard_drop_${img.replace('.JPEG', '').replace('IMG_', '')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${img}`), { contentType: 'image/jpeg', upsert: true });
  if (error) { console.error('HOST FAIL', img, error.message); process.exit(1); }
  return PUB + name;
}
// loose back -> existing card: [id, backImg, newCardNumber|null]
const BACKS: [number, string, string | null][] = [
  [71, 'IMG_0577.JPEG', 'FMA-BD'],  // Donovan auto is Finest Autographs insert FMA-BD, NOT base 214
  [35, 'IMG_0578.JPEG', null],      // Felnin Mega Box Mojo PSA10 slab back
  [63, 'IMG_0593.JPEG', null],      // Trout BTP-1
  [64, 'IMG_0594.JPEG', '149'],     // Julio Chrome base 149 (confirmed off back)
  [68, 'IMG_0595.JPEG', null],      // Roman FS-8
  [69, 'IMG_0596.JPEG', '91CB-25'], // Chase Chrome 1991 insert 91CB-25 (confirmed)
  [102, 'IMG_0597.JPEG', '151'],    // Bryan Reynolds Finest base 151 (confirmed)
];
// new cards: player, set, num, parallel, front, back, notes
const NEW: [string, string, string, string, string, string, string][] = [
  ['Cal Raleigh', '2026 Bowman', '13', 'Blue Parallel /150 (028/150)', 'IMG_0579.JPEG', 'IMG_0580.JPEG', 'Mariners C, paper Bowman blue border /150'],
  ['Felnin Celesten', '2023 Bowman Chrome', 'BCP-156', 'Refractor (mojo/pattern - confirm)', 'IMG_0581.JPEG', 'IMG_0582.JPEG', 'raw Chrome refractor, patterned; confirm exact parallel (mega box mojo?)'],
  ['Felnin Celesten', '2023 Bowman Chrome', 'BCP-156', 'Refractor (shimmer/pattern - confirm)', 'IMG_0583.JPEG', 'IMG_0584.JPEG', 'raw Chrome refractor, shimmer/wave; confirm exact parallel'],
  ['Felnin Celesten', '2026 Bowman (Prospect Auto)', 'BP-57', 'Light Blue /499 (147/499), on-card auto', 'IMG_0585.JPEG', 'IMG_0586.JPEG', 'Mariners SS, paper Bowman prospect on-card autograph /499'],
  ['Lazaro Montes', '2023 Bowman Chrome', 'BCP-58', 'Refractor (mojo/pattern - confirm)', 'IMG_0587.JPEG', 'IMG_0588.JPEG', 'raw Chrome refractor, patterned; confirm exact parallel'],
  ['Cole Young', '2026 Topps Finest', '57', 'base', 'IMG_0589.JPEG', 'IMG_0590.JPEG', 'Mariners 2B, Finest base RC'],
  ['Ricardo Cova', '2026 Bowman Chrome', 'BCP-94', 'Refractor (cracked-ice/pattern - confirm)', 'IMG_0591.JPEG', 'IMG_0592.JPEG', 'Chrome refractor, cracked-ice; confirm exact parallel'],
];
async function main() {
  for (const [id, img, num] of BACKS) {
    const back = await host(img);
    const cur = await sql`SELECT photo_urls FROM baseball_cards WHERE id=${id}`;
    const urls = (cur[0].photo_urls as string[]) ?? []; if (!urls.includes(back)) urls.push(back);
    if (num) await sql`UPDATE baseball_cards SET photo_urls=${sql.json(urls)}, needs_back_photo=false, card_number=${num} WHERE id=${id}`;
    else await sql`UPDATE baseball_cards SET photo_urls=${sql.json(urls)}, needs_back_photo=false WHERE id=${id}`;
    const r = await sql`SELECT player,card_number FROM baseball_cards WHERE id=${id}`;
    console.log(`~ back -> id${id} ${r[0].player} #${r[0].card_number}`);
  }
  let ins = 0;
  for (const [player, set, num, par, f, b, notes] of NEW) {
    const urls = [await host(f), await host(b)];
    await sql`INSERT INTO baseball_cards (user_id,player,set_name,year,card_number,parallel,sport,status,for_sale,needs_back_photo,photo_urls,notes)
      VALUES (${UID},${player},${set},${set.includes('2023') ? 2023 : 2026},${num},${par},'Baseball','photographed',true,false,${sql.json(urls)},${notes})`;
    ins++; console.log(`+ ${player} ${set} #${num} [${par}]`);
  }
  const tot = await sql`SELECT COUNT(*)::int c, SUM((for_sale)::int)::int sellable FROM baseball_cards`;
  console.log(`\nbacks attached: ${BACKS.length}; new inserted: ${ins}; total now ${tot[0].c} (sellable ${tot[0].sellable})`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
