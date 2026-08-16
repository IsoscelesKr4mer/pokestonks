/**
 * Ingest the 2026-08-13 drop: 23 cards from one Topps Chrome baseball mega,
 * photographed as IMG_1442-1493.
 *
 *   npx tsx scripts/ingest-card-drop-0813.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0813.ts --apply
 *
 * Rip already logged (rip #12 against lot #530) and the sealed listing trimmed
 * 7 -> 6 so it cannot sell a box that is now open.
 *
 * PARALLELS COME OFF THE FRONT, CONFIRMED AGAIN THIS DROP. I checked the back
 * of the Cal Raleigh (IMG_1484), which is unambiguously an X-Fractor from the
 * front checkerboard, and its back band reads plain "CHROME". So the back
 * cannot separate base, Refractor and X-Fractor on 2026 Chrome. Only the front
 * foil can.
 *
 * SEVEN CARDS ARE FLAGGED parallel_unconfirmed. They show no checkerboard, so
 * they are base or Refractor, and I will not guess between those two from a
 * photo. Getting this wrong has cost real money before: four cards went into a
 * $1.99 dropdown as base when they were Refractors. They go in as
 * status='photographed' with NO price and NO listing until Michael eyeballs
 * them. Beckett has Mega odds at Refractor 1:2 and X-Fractor 1:1, so a fair
 * few of these are probably Refractors.
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
const RIP = 'From the 2026-08-13 rip of one Topps Chrome baseball mega.';

type Row = {
  player: string; num: string; parallel: string; front: number;
  rc?: boolean; set?: string; note?: string; unconfirmed?: boolean;
};

const X = 'X-Fractor';
const CHROME = '2026 Topps Chrome';

const CARDS: Row[] = [
  // ---- inserts, identified off the back codes ----
  { player: 'Bobby Witt Jr.', num: 'SN-8', parallel: 'insert', front: 1449,
    set: `${CHROME} (Static Noise insert)`,
    note: 'CASE HIT. Beckett odds: Static Noise is 15 cards, Value 1:3,924, Mega 1:1,175. Retail exclusive, Value and Mega only. Hero of the share graphic.' },
  { player: 'Roman Anthony', num: 'WC-15', parallel: 'insert', front: 1463, rc: true,
    set: `${CHROME} (Wrecking Crew insert)`,
    note: 'Wrecking Crew is 2 per hobby box, print run roughly 85-90k per card, so a good-looking insert rather than a rare one. Value is the Roman Anthony rookie name.' },
  { player: 'Bryce Harper', num: 'BTP-19', parallel: 'insert', front: 1461,
    set: `${CHROME} (Big Ticket Player insert)`, note: 'Ticket-stub design, landscape card.' },
  { player: 'Luis Gonzalez / Corbin Carroll', num: 'PTP-12', parallel: 'insert', front: 1465,
    set: `${CHROME} (Past to Present insert)`, note: 'Dual-player Diamondbacks card.' },
  { player: 'Mookie Betts', num: 'UNKNOWN', parallel: 'insert', front: 1457,
    set: `${CHROME} (1989 Topps insert)`,
    note: 'INSERT CODE NOT READ off the back yet, needs confirming before listing.' },
  { player: 'Roman Anthony', num: 'UNKNOWN', parallel: 'insert', front: 1459, rc: true,
    set: `${CHROME} (1989 Topps insert)`,
    note: 'INSERT CODE NOT READ off the back yet, needs confirming before listing.' },

  // ---- X-Fractors, checkerboard foil clearly visible on the front ----
  { player: 'Cal Raleigh', num: '5', parallel: X, front: 1483 },
  { player: 'Kyle Karros', num: '13', parallel: X, front: 1485, rc: true },
  { player: 'Nico Hoerner', num: '29', parallel: X, front: 1473 },
  { player: 'Cole Ragans', num: '91', parallel: X, front: 1487 },
  { player: 'Gabriel Moreno', num: '92', parallel: X, front: 1475 },
  { player: 'Hurston Waldrep', num: '141', parallel: X, front: 1489 },
  { player: 'Zach Maxwell', num: '143', parallel: X, front: 1477, rc: true },
  { player: 'Brady House', num: '159', parallel: X, front: 1491 },
  { player: 'Jonathan Aranda', num: '174', parallel: X, front: 1481 },
  { player: 'Tatsuya Imai', num: '242', parallel: X, front: 1479 },

  // ---- no checkerboard: base or Refractor, NOT guessing ----
  { player: 'Shohei Ohtani', num: '7', parallel: 'base', front: 1444, unconfirmed: true,
    note: 'MVP BUYBACK CANDIDATE. Topps buyback covers base AND base parallels of the winner, so this qualifies if he takes NL MVP.' },
  { player: 'Pete Crow-Armstrong', num: '45', parallel: 'base', front: 1442, unconfirmed: true,
    note: 'MVP BUYBACK CANDIDATE, close to Ohtani in NL MVP odds per Michael. Landscape card.' },
  { player: 'Cole Young', num: '23', parallel: 'base', front: 1451, rc: true, unconfirmed: true },
  { player: 'Carson Williams', num: '195', parallel: 'base', front: 1469, rc: true, unconfirmed: true },
  { player: 'Troy Melton', num: '208', parallel: 'base', front: 1455, rc: true, unconfirmed: true },
  { player: 'Denzer Guzman', num: '237', parallel: 'base', front: 1471, rc: true, unconfirmed: true },
  { player: 'Lars Nootbaar', num: '292', parallel: 'base', front: 1453, unconfirmed: true },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // every card needs a front and a back on disk before anything is written
  const missing: string[] = [];
  for (const c of CARDS) for (const n of [c.front, c.front + 1]) {
    if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(`IMG_${n}.JPEG (${c.player})`);
  }
  if (missing.length) { console.error('MISSING PHOTOS:\n  ' + missing.join('\n  ')); process.exit(1); }

  // no two cards may claim the same photo
  const claimed = new Map<number, string>();
  for (const c of CARDS) for (const n of [c.front, c.front + 1]) {
    if (claimed.has(n)) { console.error(`IMG_${n} claimed by both ${claimed.get(n)} and ${c.player}`); process.exit(1); }
    claimed.set(n, c.player);
  }

  const conf = CARDS.filter((c) => !c.unconfirmed);
  console.log(`${CARDS.length} cards: ${conf.length} confident, ${CARDS.length - conf.length} parallel UNCONFIRMED`);
  for (const c of CARDS) {
    console.log(`  ${c.unconfirmed ? '?' : ' '} ${(c.set ?? CHROME).padEnd(44)} ${c.player} #${c.num} ${c.parallel}${c.rc ? ' RC' : ''}`);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  let n = 0;
  for (const c of CARDS) {
    const urls: string[] = [];
    for (const img of [c.front, c.front + 1]) {
      const key = `bbcard_drop_${img}.jpg`;
      const buf = readFileSync(`${DIR}/IMG_${img}.JPEG`);
      const { error } = await sb.storage.from(BUCKET).upload(key, buf, { contentType: 'image/jpeg', upsert: true });
      if (error) { console.error(`upload failed ${key}: ${error.message}`); process.exit(1); }
      urls.push(PUB + key);
    }
    const notes = [RIP, c.note, c.unconfirmed
      ? 'PARALLEL UNCONFIRMED, confirm parallel before pricing: no checkerboard on the front, so base or Refractor. The 2026 Chrome back prints "CHROME" for every tier and cannot settle it. Needs Michael to look at the card in hand before it is priced or listed.'
      : null].filter(Boolean).join(' ');
    const [row] = await sql`
      INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                  status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES (${UID}, ${c.player}, ${c.set ?? CHROME}, 2026, ${c.num}, ${c.parallel}, 'Baseball',
              'photographed', true, ${urls}, false, ${notes})
      RETURNING id`;
    n++;
    console.log(`  #${row.id} ${c.player} ${c.parallel}${c.unconfirmed ? '  [UNCONFIRMED]' : ''}`);
  }
  console.log(`\n${n} cards ingested. Confident ones are ready to price; the ${CARDS.length - conf.length} unconfirmed are not.`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
