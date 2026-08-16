/**
 * Ingest the 2026-08-15 drop: 37 cards from the six-mega "extravaganza" rip,
 * photographed as IMG_1511-1585 (front, back, front, back...).
 *
 *   npx tsx scripts/ingest-card-drop-0815.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0815.ts --apply
 *
 * PARITY: 1511-1568 run odd=front / even=back. IMG_1569 does not exist, so from
 * 1570-1585 the parity flips to even=front / odd=back. 37 fronts, 37 backs.
 *
 * THE BACK *DOES* SETTLE REFRACTOR, contrary to the note in
 * ingest-card-drop-0813.ts. Proof from this very drop: Jacob Misiorowski #196
 * appears twice, IMG_1520 and IMG_1522. Same card number, same back layout. The
 * 1522 back prints "REFRACTOR" under @TOPPS beside the team logo; the 1520 back
 * does not. So:
 *   REFRACTOR under @TOPPS            -> Refractor
 *   no marker + checkerboard front    -> X-Fractor
 *   no marker + no checkerboard front -> base
 * X-Fractor still has to come off the front, since its back is unmarked. I
 * zoomed the marker band on both cards I am calling base (Alvarez IMG_1512,
 * Judge IMG_1526) and both read only "X @TOPPS". Nothing here is a guess, so
 * nothing is flagged parallel_unconfirmed.
 *
 * FIVE CARDS DUPLICATE A ROW ALREADY IN THE VAULT from the 08-13 rip:
 *   91CB-18 Bubba Chandler   (existing #242)
 *   91CB-21 Sal Stewart      (existing #269)
 *   PTP-24  Clark / Chapman  (existing #159)
 *   PTP-23  Smith / Winn     (existing #83)
 *   P-3     Nick Kurtz       (existing #317)
 * These are second physical copies out of a different rip, not re-shoots, so
 * they go in as their own rows. They are called out in the run output and in
 * the Discord summary so Michael can check them against the team bags. If any
 * turns out to be the same card photographed twice, delete the new row.
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
const RIP = 'From the 2026-08-15 rip of six Topps Chrome baseball megas.';

const CHROME = '2026 Topps Chrome';
const X = 'X-Fractor';

type Row = {
  player: string; num: string; parallel: string; front: number; back: number;
  rc?: boolean; set?: string; note?: string;
};

const CARDS: Row[] = [
  // ---------- base / parallels ----------
  { player: 'Yordan Alvarez', num: '3', parallel: 'base', front: 1511, back: 1512,
    note: 'Back band reads only "X @TOPPS", no REFRACTOR, and the front has no checkerboard, so base.' },
  { player: 'Kevin McGonigle', num: '16', parallel: X, front: 1513, back: 1514, rc: true,
    note: 'Copy 1 of 3 pulled in this rip.' },
  { player: 'Kevin McGonigle', num: '16', parallel: X, front: 1515, back: 1516, rc: true,
    note: 'Copy 2 of 3 pulled in this rip.' },
  { player: 'Kevin McGonigle', num: '16', parallel: X, front: 1517, back: 1518, rc: true,
    note: 'Copy 3 of 3 pulled in this rip. Three of the same X-Fractor across six megas is worth a sanity check against the team bags.' },
  { player: 'Jacob Misiorowski', num: '196', parallel: X, front: 1519, back: 1520, rc: true,
    note: 'Back has no REFRACTOR marker; front checkerboard makes it the X-Fractor.' },
  { player: 'Jacob Misiorowski', num: '196', parallel: 'Refractor', front: 1521, back: 1522, rc: true,
    note: 'Back prints REFRACTOR under @TOPPS. Paired with IMG_1520 this is the control that proves the back marker works.' },
  { player: 'Aaron Judge', num: '100', parallel: 'base', front: 1525, back: 1526,
    note: 'Back band reads only "X @TOPPS", no REFRACTOR, and no checkerboard on the front, so base.' },
  { player: 'Wilyer Abreu', num: '165', parallel: 'Refractor', front: 1582, back: 1583,
    note: 'REFRACTOR printed under @TOPPS on the back.' },
  { player: 'Tanner Bibee', num: '89', parallel: 'Refractor', front: 1584, back: 1585,
    note: 'REFRACTOR printed under @TOPPS on the back.' },

  // ---------- numbered parallels ----------
  { player: 'Jose Ramirez', num: '127', parallel: 'Green X-Fractor /99', front: 1527, back: 1528,
    note: 'Serial reads 52/99; the leading digit is partly behind the pant leg in the photo, so confirm 52 vs 62 off the card. Landscape card.' },
  { player: 'Kris Bryant', num: '288', parallel: 'Aqua X-Fractor /199', front: 1529, back: 1530,
    note: 'Serial 026/199, read clean off the front.' },
  { player: 'Luis Arraez', num: '168', parallel: 'Aqua X-Fractor /199', front: 1531, back: 1532,
    note: 'Serial 013/199. Same aqua checkerboard as the Bryant, whose /199 read clean.' },

  // ---------- autograph ----------
  { player: 'Jack Winkler', num: 'RA-JWI', parallel: 'Pink Refractor Auto /250', front: 1523, back: 1524, rc: true,
    set: `${CHROME} (Rookie Autographs)`,
    note: 'BIGGEST CARD OF THE RIP. On-card Topps Certified Autograph Issue, serial 158/250. Do not auto-price.' },

  // ---------- 1991 Topps 75 Years inserts (91CB-) ----------
  { player: 'Bubba Chandler', num: '91CB-18', parallel: 'insert', front: 1539, back: 1540, rc: true,
    set: `${CHROME} (1991 Topps 75 Years insert)`, note: 'SECOND COPY, vault already has #242.' },
  { player: 'Christian Moore', num: '91CB-26', parallel: 'insert', front: 1541, back: 1542, rc: true,
    set: `${CHROME} (1991 Topps 75 Years insert)` },
  { player: 'Kazuma Okamoto', num: '91CB-24', parallel: 'insert', front: 1561, back: 1562, rc: true,
    set: `${CHROME} (1991 Topps 75 Years insert)` },
  { player: 'Juan Soto', num: '91CB-11', parallel: 'insert', front: 1563, back: 1564,
    set: `${CHROME} (1991 Topps 75 Years insert)` },
  { player: 'Mike Trout', num: '91CB-6', parallel: 'insert', front: 1565, back: 1566,
    set: `${CHROME} (1991 Topps 75 Years insert)` },
  { player: 'Sal Stewart', num: '91CB-21', parallel: 'insert', front: 1567, back: 1568, rc: true,
    set: `${CHROME} (1991 Topps 75 Years insert)`, note: 'SECOND COPY, vault already has #269.' },

  // ---------- Wrecking Crew (WC-) ----------
  { player: 'Aaron Judge', num: 'WC-1', parallel: 'insert', front: 1570, back: 1571,
    set: `${CHROME} (Wrecking Crew insert)` },
  { player: 'Shohei Ohtani', num: 'WC-2', parallel: 'insert', front: 1574, back: 1575,
    set: `${CHROME} (Wrecking Crew insert)` },
  { player: 'Cal Raleigh', num: 'WC-5', parallel: 'insert', front: 1576, back: 1577,
    set: `${CHROME} (Wrecking Crew insert)` },
  { player: 'Spencer Torkelson', num: 'WC-19', parallel: 'insert', front: 1578, back: 1579,
    set: `${CHROME} (Wrecking Crew insert)` },
  { player: 'Elly De La Cruz', num: 'WC-22', parallel: 'insert', front: 1572, back: 1573,
    set: `${CHROME} (Wrecking Crew insert)` },

  // ---------- Past to Present (PTP-) ----------
  { player: 'Edgar Martinez / Cal Raleigh', num: 'PTP-15', parallel: 'insert', front: 1553, back: 1554,
    set: `${CHROME} (Past to Present insert)`, note: 'Mariners dual.' },
  { player: 'Adrian Beltre / Corey Seager', num: 'PTP-19', parallel: 'insert', front: 1549, back: 1550,
    set: `${CHROME} (Past to Present insert)`, note: 'Rangers dual.' },
  { player: 'Ozzie Smith / Masyn Winn', num: 'PTP-23', parallel: 'insert', front: 1551, back: 1552,
    set: `${CHROME} (Past to Present insert)`, note: 'Cardinals dual. SECOND COPY, vault already has #83.' },
  { player: 'Will Clark / Matt Chapman', num: 'PTP-24', parallel: 'insert', front: 1547, back: 1548,
    set: `${CHROME} (Past to Present insert)`, note: 'Giants dual. SECOND COPY, vault already has #159.' },

  // ---------- Perspectives (P-) ----------
  { player: 'Nick Kurtz', num: 'P-3', parallel: 'insert', front: 1535, back: 1536,
    set: `${CHROME} (Perspectives insert)`, note: 'SECOND COPY, vault already has #317.' },
  { player: 'Ronald Acuna Jr.', num: 'P-6', parallel: 'insert', front: 1533, back: 1534,
    set: `${CHROME} (Perspectives insert)` },
  { player: 'Derek Jeter', num: 'P-10', parallel: 'insert', front: 1537, back: 1538,
    set: `${CHROME} (Perspectives insert)` },

  // ---------- Big Ticket Player (BTP-) ----------
  { player: 'Shohei Ohtani', num: 'BTP-3', parallel: 'insert', front: 1557, back: 1558,
    set: `${CHROME} (Big Ticket Player insert)` },
  { player: 'James Wood', num: 'BTP-15', parallel: 'insert', front: 1555, back: 1556,
    set: `${CHROME} (Big Ticket Player insert)` },
  { player: 'Chase Burns', num: 'BTP-24', parallel: 'insert', front: 1559, back: 1560, rc: true,
    set: `${CHROME} (Big Ticket Player insert)` },

  // ---------- Chrome Rivals (RVA-) ----------
  { player: 'Christian Yelich', num: 'RVA-24', parallel: 'insert', front: 1545, back: 1546,
    set: `${CHROME} (Chrome Rivals insert)`, note: 'AWAY variant per the corner tab.' },
  { player: 'Fernando Tatis Jr.', num: 'RVA-25', parallel: 'insert', front: 1543, back: 1544,
    set: `${CHROME} (Chrome Rivals insert)`, note: 'AWAY variant per the corner tab.' },

  // ---------- Future Stars (FS-) ----------
  { player: 'Colson Montgomery', num: 'FS-2', parallel: 'insert', front: 1580, back: 1581, rc: true,
    set: `${CHROME} (Future Stars insert)` },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (CARDS.length !== 37) { console.error(`expected 37 cards, got ${CARDS.length}`); process.exit(1); }

  // every card needs both photos on disk before anything is written
  const missing: string[] = [];
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(`IMG_${n}.JPEG (${c.player})`);
  }
  if (missing.length) { console.error('MISSING PHOTOS:\n  ' + missing.join('\n  ')); process.exit(1); }

  // no two cards may claim the same photo, and every photo in the folder must be used
  const claimed = new Map<number, string>();
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (claimed.has(n)) { console.error(`IMG_${n} claimed by both ${claimed.get(n)} and ${c.player}`); process.exit(1); }
    claimed.set(n, c.player);
  }
  const expected = [...Array(58).keys()].map((i) => 1511 + i).concat([...Array(16).keys()].map((i) => 1570 + i));
  const unused = expected.filter((n) => n !== 1569 && existsSync(`${DIR}/IMG_${n}.JPEG`) && !claimed.has(n));
  if (unused.length) { console.error(`photos on disk not claimed by any card: ${unused.join(', ')}`); process.exit(1); }
  console.log(`${claimed.size} photos claimed by ${CARDS.length} cards, none double-claimed, none orphaned\n`);

  // report collisions with rows already in the vault
  const dupes: any = await sql`
    SELECT id, player, set_name, card_number, status FROM baseball_cards
    WHERE card_number = ANY(${CARDS.map((c) => c.num)}) AND set_name LIKE '2026 Topps Chrome%'
    ORDER BY card_number`;
  if (dupes.length) {
    console.log('ALREADY IN THE VAULT under the same card number:');
    for (const d of dupes) console.log(`  #${d.id} ${d.card_number} ${d.player} [${d.status}] ${d.set_name}`);
    console.log('  -> treated as second physical copies; verify against the team bags.\n');
  }

  for (const c of CARDS) {
    console.log(`  ${(c.set ?? CHROME).replace('2026 Topps Chrome', 'TC').padEnd(30)} ${String(c.num).padEnd(9)} ${c.player}${c.rc ? ' (RC)' : ''} [${c.parallel}]`);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  let n = 0;
  for (const c of CARDS) {
    const urls: string[] = [];
    for (const img of [c.front, c.back]) {
      const key = `bbcard_drop_${img}.jpg`;
      const buf = readFileSync(`${DIR}/IMG_${img}.JPEG`);
      const { error } = await sb.storage.from(BUCKET).upload(key, buf, { contentType: 'image/jpeg', upsert: true });
      if (error) { console.error(`upload failed ${key}: ${error.message}`); process.exit(1); }
      urls.push(PUB + key);
    }
    const notes = [RIP, c.note].filter(Boolean).join(' ');
    const [row] = await sql`
      INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                  status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES (${UID}, ${c.player}, ${c.set ?? CHROME}, 2026, ${c.num}, ${c.parallel}, 'Baseball',
              'photographed', true, ${urls}, false, ${notes})
      RETURNING id`;
    n++;
    console.log(`  #${row.id} ${c.num} ${c.player}`);
  }
  console.log(`\n${n} cards ingested.`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
