/**
 * Ingest the 2026-08-09 drop: 51 cards from two Topps Chrome baseball megas,
 * photographed as IMG_1276-1377.
 *
 *   npx tsx scripts/ingest-card-drop-0809.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0809.ts --apply
 *
 * Rips already logged (rips #10, #11 against lot #530) and the sealed listing
 * trimmed 8 -> 7 so it cannot sell a box that is now open.
 *
 * PARALLELS COME OFF THE FRONT. The 2026 Chrome back prints "CHROME" for base
 * and X-Fractor alike, so the checkerboard foil on the front is the only
 * reliable tell. Card numbers and insert codes come off the back.
 *
 * TWO CARDS MICHAEL IDENTIFIED that I had flagged as unknown:
 *   Kyle Tucker #58  = Lightboard Variation SSP, comps $34.95-$85, a case hit
 *   Nick Kurtz P-3   = Perspectives insert, a common one at $2-5
 * Neither is base, and the Tucker would have gone into a $3 dropdown row.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const RIP = 'From the 2026-08-09 rip of two Topps Chrome baseball megas.';

type Row = { player: string; num: string; parallel: string; front: number; rc?: boolean; set?: string; note?: string };

const X = 'X-Fractor';
const B = 'base';

const CARDS: Row[] = [
  { player: 'Sal Stewart', num: '91CB-21', parallel: 'insert', front: 1276, rc: true, set: '2026 Topps Chrome (1991 Topps 75 Years insert)' },
  { player: 'Samuel Basallo', num: '91CB-17', parallel: 'insert', front: 1278, rc: true, set: '2026 Topps Chrome (1991 Topps 75 Years insert)' },
  { player: 'Isaac Collins', num: '251', parallel: B, front: 1280, note: 'All-Star Rookie Cup.' },
  { player: 'Nick Kurtz', num: '250', parallel: B, front: 1282, note: 'All-Star Rookie Cup.' },
  { player: 'Kyle Schwarber', num: '123', parallel: B, front: 1284 },
  { player: 'Jesus Luzardo', num: '265', parallel: B, front: 1286 },
  { player: 'Gunnar Henderson', num: '153', parallel: B, front: 1288 },
  { player: 'Noelvi Marte', num: '11', parallel: B, front: 1290 },
  { player: 'Steven Kwan', num: '170', parallel: B, front: 1292 },
  { player: 'Freddie Freeman', num: 'WC-13', parallel: 'insert', front: 1294, set: '2026 Topps Chrome (Wrecking Crew insert)' },
  { player: 'JJ Wetherholt', num: 'FS-3', parallel: 'insert', front: 1296, rc: true, set: '2026 Topps Chrome (Future Stars insert)' },
  { player: 'Manny Ramirez', num: 'RVA-13', parallel: 'insert', front: 1298, set: '2026 Topps Chrome (Chrome Rivals insert)', note: 'AWAY variant.' },
  { player: 'Roman Anthony', num: 'BTP-23', parallel: 'insert', front: 1300, rc: true, set: '2026 Topps Chrome (Big Ticket Player insert)' },
  { player: 'Mike Piazza', num: 'RVA-2', parallel: 'insert', front: 1302, set: '2026 Topps Chrome (Chrome Rivals insert)', note: 'AWAY variant.' },
  { player: 'Kyle Schwarber', num: 'WC-3', parallel: 'insert', front: 1304, set: '2026 Topps Chrome (Wrecking Crew insert)' },
  { player: 'Jackson Chourio', num: 'BTP-12', parallel: 'insert', front: 1306, set: '2026 Topps Chrome (Big Ticket Player insert)' },
  { player: 'Kodai Senga', num: '138', parallel: X, front: 1308 },
  { player: 'Xander Bogaerts', num: '155', parallel: X, front: 1310 },
  { player: 'Yoshinobu Yamamoto', num: '75', parallel: X, front: 1312 },
  { player: 'Willy Adames', num: '140', parallel: X, front: 1314 },
  { player: 'Wyatt Langford', num: '213', parallel: X, front: 1316 },
  { player: 'Sal Frelick', num: '60', parallel: X, front: 1318 },
  { player: 'Riley Greene', num: '180', parallel: X, front: 1320 },
  { player: 'Isaac Collins', num: '251', parallel: X, front: 1322, note: 'All-Star Rookie Cup. Second Isaac Collins #251, this one the X-Fractor.' },
  { player: 'Jeff McNeil', num: '164', parallel: X, front: 1324 },
  { player: 'Nolan Arenado', num: '182', parallel: X, front: 1326 },
  { player: 'Justin Crawford', num: '73', parallel: X, front: 1328, rc: true },
  { player: 'Lawrence Butler', num: '223', parallel: X, front: 1330 },
  { player: 'Christian Walker', num: '252', parallel: X, front: 1332 },
  { player: 'Brandon Nimmo', num: '101', parallel: X, front: 1334 },
  { player: 'Cam Smith', num: '108', parallel: X, front: 1336 },
  { player: 'Dillon Dingler', num: '18', parallel: X, front: 1338 },
  { player: 'Denzer Guzman', num: '257', parallel: X, front: 1340, rc: true },
  { player: 'Ezequiel Tovar', num: '8', parallel: X, front: 1342 },
  { player: 'Victor Scott II', num: '53', parallel: X, front: 1344 },
  { player: 'Parker Messick', num: '184', parallel: B, front: 1346, rc: true },
  { player: 'C.J. Kayfus', num: '46', parallel: B, front: 1348, rc: true },
  { player: 'Samuel Basallo', num: '7', parallel: B, front: 1350, rc: true },
  { player: 'Troy Melton', num: '202', parallel: B, front: 1352, rc: true },
  { player: 'Trey Yesavage', num: '86', parallel: B, front: 1354, rc: true },
  { player: 'Cole Young', num: '23', parallel: B, front: 1356, rc: true },
  { player: 'Otto Kemp', num: '229', parallel: B, front: 1358, rc: true },
  { player: 'Cam Schlittler', num: '262', parallel: B, front: 1360, rc: true },
  { player: 'Chase Burns', num: '134', parallel: B, front: 1362, rc: true },
  { player: 'Drew Gilbert', num: '126', parallel: B, front: 1364, rc: true },
  { player: 'Sal Stewart', num: '6', parallel: B, front: 1366, rc: true },
  { player: 'Jacob Misiorowski', num: '196', parallel: B, front: 1368, rc: true },
  { player: 'Pete Crow-Armstrong', num: '45', parallel: B, front: 1370 },
  { player: 'Nick Kurtz', num: 'P-3', parallel: 'insert', front: 1372, set: '2026 Topps Chrome (Perspectives insert)', note: 'Perspectives, identified by Michael.' },
  { player: 'Kyle Tucker', num: '58', parallel: 'Lightboard Variation SSP', front: 1374, note: 'SSP case hit, identified by Michael. Comps $34.95-$85. LIST ON ITS OWN, never in a you-pick.' },
  { player: 'Shohei Ohtani', num: '1', parallel: X, front: 1376, note: 'Card #1 in the set. Comps $34.99-$59.99. LIST ON ITS OWN.' },
];

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function host(n: number) {
  const name = `bbcard_drop_${n}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/IMG_${n}.JPEG`), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`host fail ${n}: ${error.message}`);
  return PUB + name;
}

async function main() {
  console.log(`${CARDS.length} cards`);
  const missing: number[] = [];
  for (const c of CARDS) for (const n of [c.front, c.front + 1]) if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(n);
  if (missing.length) { console.error('missing photos:', missing.join(', ')); process.exit(1); }
  const seen = new Set<number>();
  for (const c of CARDS) for (const n of [c.front, c.front + 1]) {
    if (seen.has(n)) { console.error(`IMG_${n} claimed twice`); process.exit(1); }
    seen.add(n);
  }
  console.log(`${seen.size} photos, all present, none double-claimed`);
  const byPar: Record<string, number> = {};
  for (const c of CARDS) byPar[c.parallel] = (byPar[c.parallel] ?? 0) + 1;
  for (const k of Object.keys(byPar).sort()) console.log(`  ${String(byPar[k]).padStart(2)}  ${k}`);
  console.log(`  ${CARDS.filter((c) => c.rc).length} rookies`);

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  let n = 0;
  for (const c of CARDS) {
    const photos = [await host(c.front), await host(c.front + 1)];
    const notes = [RIP, c.rc ? 'RC.' : '', c.note ?? ''].filter(Boolean).join(' ');
    const [row] = await sql`
      INSERT INTO baseball_cards
        (user_id, player, set_name, year, card_number, parallel, sport, status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES (${UID}, ${c.player}, ${c.set ?? '2026 Topps Chrome'}, 2026, ${c.num}, ${c.parallel},
              'Baseball', 'photographed', true, ${sql.json(photos)}, false, ${notes})
      RETURNING id`;
    n++;
    console.log(`#${row.id} ${c.player} #${c.num} (${c.parallel})`);
  }
  console.log(`\ninserted ${n}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
