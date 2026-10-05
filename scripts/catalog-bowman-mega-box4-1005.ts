/**
 * Catalogue box 4 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0529-0600.
 *
 *   npx tsx scripts/catalog-bowman-mega-box4-1005.ts --apply
 *
 * 72 files, 529-600, odd=front even=back, NO GAPS. All 36 card numbers verified
 * against the checklist: 18 lettered codes AND, for the first time, all 18 plain
 * numeric base cards. The numeric base set DOES parse out of the PDF, just not
 * via scripts/parse-checklist.py - the raw pypdf text has lines like
 * "79 Jac Caglianone Kansas City Royals Rookie", so `^(\d{1,3})\s+([A-Z].*)$`
 * reads all 100. Earlier boxes treated numeric cards as uncheckable; they are not.
 *
 * TWO CARDS HERE ARE NOT $2 DROPDOWN FODDER:
 *
 * 1. JOSE FERNANDEZ #40 - CHROME ROOKIE RED RC VARIATION. Same signature as the
 *    Caglianone in box 3: the border shows a smooth pastel spectral sweep rather
 *    than the flat neutral of a base card, there is no serial, and the RC shield
 *    body is SOLID RED where Chandler, Sal Stewart and Roman Anthony in this same
 *    box are all navy. Second Red RC in four boxes.
 *
 * 2. WILTON GUERRERO JR. BCP-178 - AQUA MOJO REFRACTOR, SERIAL 054/125. The
 *    serial is printed on the front, right side above the nameplate, and reads
 *    054/125 at 5x. The 2026 Bowman Chrome ladder puts Aqua at /125, and the
 *    background carries the geometric Mojo tile. This is the first numbered
 *    parallel in any of the four boxes. He appears TWICE in this box - the other
 *    copy (#13) is an ordinary unnumbered Mojo, so they are different cards.
 *
 * Parallels called on the front; Bowman Chrome has no back marker.
 *   Mojo = tight geometric tile | Lazer = scattered streaks | base = flat
 * Lands on 9 Mojo / 2 Lazer / 1 Aqua Mojo /125 / 1 Red RC / 2 insert / 21 base.
 *
 * IN-BOX DUPLICATES, all genuine pairs at different parallels:
 *   Guerrero BCP-178 (Aqua /125 + Mojo), De Brun BCP-151 (Lazer + base),
 *   Lo Re BCP-182 (Lazer + base), Freeland (IT-8 insert + #31 Mojo).
 * Anything he already owns at the SAME parallel goes in with duplicate_of_id set
 * and for_sale=false so one physical card can never be listed twice.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BASE = '2026 Bowman Chrome';
const SB = '2026 Bowman Chrome (Spring Breakout insert)';
const ITL = '2026 Bowman Chrome (It Came to the League insert)';

const MOJO = 'Mojo Refractor';
const LAZER = 'Lazer Refractor';
const PLAIN = 'base';
const REDRC = 'Chrome Rookie Red RC Variation';
const AQUA = 'Aqua Mojo Refractor /125 (054/125)';

type C = { f: number; player: string; num: string; par: string; set?: string; tags: string };

const CARDS: C[] = [
  { f: 529, player: 'Jose Fernandez', num: '40', par: REDRC, tags: 'Diamondbacks 1B, RC. RED RC SHIELD - list on its own, not in a PYP dropdown' },
  { f: 531, player: 'Shohei Ohtani', num: '100', par: MOJO, tags: 'Dodgers DH/P' },
  { f: 533, player: 'Wilton Guerrero Jr.', num: 'BCP-178', par: AQUA, tags: 'Pirates SS, 1st Bowman. NUMBERED 054/125 - list on its own' },
  { f: 535, player: 'Alex Freeland', num: 'IT-8', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Dodgers SS, RC' },
  { f: 537, player: 'Alex Freeland', num: '31', par: MOJO, tags: 'Dodgers 2B, RC' },
  { f: 539, player: 'Slater De Brun', num: 'BCP-151', par: LAZER, tags: 'Rays OF, 1st Bowman' },
  { f: 541, player: 'Bubba Chandler', num: '38', par: MOJO, tags: 'Pirates P, RC' },
  { f: 543, player: 'Walker Jenkins', num: 'BCP-199', par: MOJO, tags: 'Twins OF' },
  { f: 545, player: 'Ezequiel Melbourne', num: 'BCP-167', par: MOJO, tags: 'Dodgers SS, 1st Bowman' },
  { f: 547, player: 'James Tibbs III', num: 'SB-7', par: 'Spring Breakout insert (refractor)', set: SB, tags: 'Dodgers OF' },
  { f: 549, player: 'Sebastian Dos Santos', num: 'BCP-190', par: MOJO, tags: 'Cardinals SS, 1st Bowman' },
  { f: 551, player: 'Gunnar Henderson', num: '85', par: MOJO, tags: 'Orioles SS' },
  { f: 553, player: 'Wilton Guerrero Jr.', num: 'BCP-178', par: MOJO, tags: 'Pirates SS, 1st Bowman, second copy in this box (the other is the Aqua /125)' },
  { f: 555, player: 'Jaiden Lo Re', num: 'BCP-182', par: LAZER, tags: 'Orioles SS, 1st Bowman' },
  { f: 557, player: 'Kevin McGonigle', num: '6', par: MOJO, tags: 'Tigers SS, RC' },
  { f: 559, player: 'Connelly Early', num: '33', par: PLAIN, tags: 'Red Sox P, RC' },
  { f: 561, player: 'Bryce Eldridge', num: '78', par: PLAIN, tags: 'Giants 1B, RC' },
  { f: 563, player: 'Roman Anthony', num: '43', par: PLAIN, tags: 'Red Sox OF, RC' },
  { f: 565, player: 'Sal Stewart', num: '48', par: PLAIN, tags: 'Reds 3B, RC' },
  { f: 567, player: 'Tatsuya Imai', num: '28', par: PLAIN, tags: 'Astros P, RC' },
  { f: 569, player: 'Junior Caminero', num: '98', par: PLAIN, tags: 'Rays 3B' },
  { f: 571, player: 'Willy Adames', num: '69', par: PLAIN, tags: 'Giants SS' },
  { f: 573, player: 'Aaron Judge', num: '66', par: PLAIN, tags: 'Yankees OF' },
  { f: 575, player: 'Corey Seager', num: '82', par: PLAIN, tags: 'Rangers SS' },
  { f: 577, player: 'Chris Sale', num: '62', par: PLAIN, tags: 'Braves P' },
  { f: 579, player: 'Cody Bellinger', num: '9', par: PLAIN, tags: 'Yankees OF' },
  { f: 581, player: 'Nick Kurtz', num: '18', par: PLAIN, tags: 'Athletics 1B' },
  { f: 583, player: 'Jaider Suarez', num: 'BCP-180', par: PLAIN, tags: 'Royals SS, 1st Bowman' },
  { f: 585, player: 'Joniel Hernandez', num: 'BCP-201', par: PLAIN, tags: 'Padres SS, 1st Bowman' },
  { f: 587, player: 'Darell Morel', num: 'BCP-165', par: PLAIN, tags: 'Pirates SS, 1st Bowman' },
  { f: 589, player: 'Louis Andujar', num: 'BCP-198', par: PLAIN, tags: 'Red Sox SS, 1st Bowman' },
  { f: 591, player: 'Slater De Brun', num: 'BCP-151', par: PLAIN, tags: 'Rays OF, 1st Bowman, second copy in this box (the other is Lazer)' },
  { f: 593, player: 'Jaiden Lo Re', num: 'BCP-182', par: PLAIN, tags: 'Orioles SS, 1st Bowman, second copy in this box (the other is Lazer)' },
  { f: 595, player: 'Juan Rojas', num: 'BCP-193', par: PLAIN, tags: 'Astros SS, 1st Bowman' },
  { f: 597, player: 'Fabricio Blanco', num: 'BCP-158', par: PLAIN, tags: 'Rays SS, 1st Bowman' },
  { f: 599, player: 'Isaias Castillo', num: 'BCP-156', par: PLAIN, tags: 'Yankees OF, 1st Bowman' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');
  const byPar: Record<string, number> = {};
  CARDS.forEach((c) => { byPar[c.par] = (byPar[c.par] ?? 0) + 1; });
  Object.entries(byPar).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));

  const claimed = new Set<number>();
  for (const c of CARDS) { claimed.add(c.f); claimed.add(c.f + 1); }
  const missing = Array.from({ length: 72 }, (_, i) => 529 + i).filter((n) => !claimed.has(n));
  if (missing.length) { console.log('ABORT, photos not claimed: ' + missing.join(',')); await sql.end(); return; }
  console.log('all 72 photos claimed exactly once, none orphaned');

  if (!APPLY) {
    for (const c of CARDS) {
      const hit = await sql`SELECT id, status, ebay_item_id FROM baseball_cards
        WHERE player = ${c.player} AND set_name = ${c.set ?? BASE}
          AND card_number = ${c.num} AND parallel = ${c.par} AND duplicate_of_id IS NULL`;
      if (hit.length) console.log(`  ALREADY OWNED  ${c.player} ${c.num} ${c.par} -> id ${hit[0].id} (${hit[0].status}, item ${hit[0].ebay_item_id ?? '-'})`);
    }
    console.log('\ndry run, nothing written');
    await sql.end();
    return;
  }

  let n = 0;
  const bumps: string[] = [];
  for (const c of CARDS) {
    const prior = await sql`SELECT id, status, ebay_item_id, ebay_sku FROM baseball_cards
      WHERE player = ${c.player} AND set_name = ${c.set ?? BASE}
        AND card_number = ${c.num} AND parallel = ${c.par}
        AND duplicate_of_id IS NULL
      ORDER BY id LIMIT 1`;
    const dup = prior.length ? (prior[0] as any) : null;

    let notes = 'From box 4 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-05. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    if (c.par === REDRC) {
      notes += ' | RED RC VARIATION confirmed three ways: border shows a smooth spectral sweep '
        + 'where base is flat; no serial on the front; RC shield body is RED against the navy '
        + 'shields of the other rookies in this box.';
    }
    if (c.par === AQUA) {
      notes += ' | SERIAL READ AT 5x off the front, right side above the nameplate: 054/125. '
        + 'The 2026 Bowman Chrome ladder puts Aqua at /125.';
    }
    if (dup) {
      notes += ' | SECOND PHYSICAL COPY of id ' + dup.id + '. Held off sale so the card cannot be '
        + 'listed twice; raise the quantity on the existing listing instead.';
      if (dup.ebay_item_id) bumps.push(`${c.player} #${c.num} ${c.par} -> item ${dup.ebay_item_id} sku ${dup.ebay_sku}`);
    }

    await sql`INSERT INTO baseball_cards
      (user_id, player, set_name, year, card_number, parallel, sport, status,
       for_sale, needs_back_photo, notes, duplicate_of_id)
      VALUES (${UID}, ${c.player}, ${c.set ?? BASE}, 2026, ${c.num}, ${c.par},
              'Baseball', 'photographed', ${!dup}, false, ${notes},
              ${dup ? dup.id : null})`;
    n++;
  }
  console.log('inserted ' + n);
  if (bumps.length) {
    console.log('\nSECOND COPIES OF CARDS ALREADY LIVE - qty bump needed on eBay:');
    bumps.forEach((b) => console.log('  ' + b));
  }

  const chk = await sql`SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') AS p
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1, 2 HAVING count(DISTINCT player) > 1`;
  if (chk.length) {
    console.log('COLLISIONS:');
    chk.forEach((r: any) => console.log('  ' + r.set_name + ' #' + r.card_number + ' -> ' + r.p));
  } else {
    console.log('\ncollision check clean');
  }

  const tot = await sql`SELECT count(*)::int n FROM baseball_cards`;
  console.log('vault total now ' + tot[0].n);
  await sql.end();
})();
