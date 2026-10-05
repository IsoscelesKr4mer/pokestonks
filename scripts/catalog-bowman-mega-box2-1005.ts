/**
 * Catalogue box 2 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0385-0456.
 *
 *   npx tsx scripts/catalog-bowman-mega-box2-1005.ts --apply
 *
 * Photos front/back, odd=front even=back, 72 files, NO GAPS in 385-456 (checked
 * before mapping - a missing file flips parity for everything after it).
 *
 * PARALLELS WERE CALLED OFF A CONTROL PAIR, NOT FROM MEMORY. 2026 Bowman Chrome
 * has no REFRACTOR marker on the back, so the call is made on the front:
 *   - Mojo  = tight geometric tile foil filling the background
 *   - Lazer = scattered laser streaks over a darker ground
 *   - base  = flat, no pattern at all
 * Box 1's Tatis (called base) and Bichette (called Mojo) were put side by side
 * with this box's Suarez to anchor the Mojo call before any of it was written
 * down. Box 2 lands on 10 Mojo / 2 Lazer / 2 insert / 22 base, which is exactly
 * box 1's distribution - a good sign the reads are consistent.
 *
 * All 20 lettered codes verified against the Bowman Chrome checklist, 20/20.
 * The 16 plain-numeric base cards are NOT in either checklist PDF because the
 * numeric base section does not parse out of them. Per box 1: the checklist is
 * PARTIAL, its presence is evidence and its absence is not. Four of the sixteen
 * corroborate against rows already in the vault (Okamoto 94, McGonigle 6,
 * Ohtani 100, Murakami 76).
 *
 * All 7 rookies were zoomed to check the RC shield colour. Every one is the
 * standard navy shield. NO Chrome Rookie Red RC Variations in this box, which
 * matters because a Red RC is ~$50 against ~$2 for the plain rookie.
 *
 * DUPLICATES, all deliberate, none of them a misread:
 *   - Francisco Renteria BCP-163 twice IN THIS BOX: one Mojo (#4), one base (#15)
 *   - Jeyson Horton BCP-228 twice IN THIS BOX: one Mojo (#13), one base (#36)
 *   - Jesus Made BCP-244 and Kazuma Okamoto 94 also exist from box 1, but at the
 *     opposite parallel each time, so they are different cards
 *   - Carson Benge IT-7 IS a true second copy of box 1's, same insert, same
 *     parallel. Flagging it so he can check it against the team bags.
 *
 * LAZARO MONTES SB-23 GOES IN AS A PC KEEPER, for_sale=false. He is a Mariners
 * prospect and Montes is already named in the PC group alongside Celesten, Cova
 * and Emerson. Michael pulled every Celesten off eBay tonight for exactly this
 * reason. Flip it if that read is wrong - it is the only card here not for sale.
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

type C = { f: number; player: string; num: string; par: string; set?: string; pc?: boolean; tags: string };

const CARDS: C[] = [
  { f: 385, player: 'Lazaro Montes', num: 'SB-23', par: 'Spring Breakout insert (refractor)', set: SB, pc: true, tags: 'Mariners OF' },
  { f: 387, player: 'Jaider Suarez', num: 'BCP-180', par: MOJO, tags: 'Royals SS, 1st Bowman' },
  { f: 389, player: 'Carson Benge', num: 'IT-7', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Mets OF, RC, second copy (box 1 had one too)' },
  { f: 391, player: 'Francisco Renteria', num: 'BCP-163', par: MOJO, tags: 'Phillies OF, 1st Bowman' },
  { f: 393, player: 'Kazuma Okamoto', num: '94', par: MOJO, tags: 'Blue Jays 3B, RC' },
  { f: 395, player: 'Joniel Hernandez', num: 'BCP-201', par: MOJO, tags: 'Padres SS, 1st Bowman' },
  { f: 397, player: 'Corbin Carroll', num: '83', par: MOJO, tags: 'Diamondbacks OF' },
  { f: 399, player: 'Sebastian Dos Santos', num: 'BCP-190', par: LAZER, tags: 'Cardinals SS, 1st Bowman' },
  { f: 401, player: 'Angel Salio', num: 'BCP-210', par: MOJO, tags: 'Reds SS, 1st Bowman' },
  { f: 403, player: 'Kevin Alvarez', num: 'BCP-234', par: MOJO, tags: 'Astros OF' },
  { f: 405, player: 'Roman Anthony', num: '43', par: MOJO, tags: 'Red Sox OF, RC' },
  { f: 407, player: 'Sebastian Blanco', num: 'BCP-169', par: LAZER, tags: 'Rockies SS, 1st Bowman' },
  { f: 409, player: 'Jeyson Horton', num: 'BCP-228', par: MOJO, tags: 'Angels SS, 1st Bowman' },
  { f: 411, player: 'Chase Burns', num: '27', par: MOJO, tags: 'Reds P, RC' },
  { f: 413, player: 'Francisco Renteria', num: 'BCP-163', par: PLAIN, tags: 'Phillies OF, 1st Bowman, second copy in this box (the other is Mojo)' },
  { f: 415, player: 'Avery Owusu-Asiedu', num: 'BCP-202', par: PLAIN, tags: 'Diamondbacks OF, 1st Bowman' },
  { f: 417, player: 'Kevin McGonigle', num: '6', par: PLAIN, tags: 'Tigers SS, RC' },
  { f: 419, player: 'MacKenzie Gore', num: '36', par: PLAIN, tags: 'Rangers P' },
  { f: 421, player: 'Mason Miller', num: '53', par: PLAIN, tags: 'Padres P' },
  { f: 423, player: 'Francisco Lindor', num: '17', par: PLAIN, tags: 'Mets SS' },
  { f: 425, player: 'Shohei Ohtani', num: '100', par: PLAIN, tags: 'Dodgers DH/P' },
  { f: 427, player: 'Brandon Clarke', num: 'BCP-171', par: PLAIN, tags: 'Cardinals P, 1st Bowman' },
  { f: 429, player: 'Jose Castro', num: 'BCP-230', par: PLAIN, tags: 'Marlins OF, 1st Bowman' },
  { f: 431, player: 'Juneiker Caceres', num: 'BCP-211', par: PLAIN, tags: 'Guardians OF' },
  { f: 433, player: 'James Wood', num: '21', par: PLAIN, tags: 'Nationals OF' },
  { f: 435, player: 'Noah Schultz', num: '11', par: PLAIN, tags: 'White Sox P, RC' },
  { f: 437, player: 'Justin Verlander', num: '14', par: PLAIN, tags: 'Tigers P' },
  { f: 439, player: 'Bobby Witt Jr.', num: '5', par: PLAIN, tags: 'Royals SS' },
  { f: 441, player: 'Jesús Made', num: 'BCP-244', par: PLAIN, tags: 'Brewers SS' },
  { f: 443, player: 'Gavin Fien', num: 'BCP-215', par: PLAIN, tags: 'Nationals SS' },
  { f: 445, player: 'Joseph Sullivan', num: 'BCP-168', par: PLAIN, tags: 'Astros OF, 1st Bowman' },
  { f: 447, player: 'Austin Riley', num: '92', par: PLAIN, tags: 'Braves 3B' },
  { f: 449, player: 'José Ramírez', num: '8', par: PLAIN, tags: 'Guardians 3B' },
  { f: 451, player: 'Munetaka Murakami', num: '76', par: PLAIN, tags: 'White Sox 1B, RC' },
  { f: 453, player: 'Cooper Pratt', num: 'BCP-248', par: PLAIN, tags: 'Brewers SS' },
  { f: 455, player: 'Jeyson Horton', num: 'BCP-228', par: PLAIN, tags: 'Angels SS, 1st Bowman, second copy in this box (the other is Mojo)' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');
  const byPar: Record<string, number> = {};
  CARDS.forEach((c) => { byPar[c.par] = (byPar[c.par] ?? 0) + 1; });
  Object.entries(byPar).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));

  // every photo claimed exactly once, none orphaned
  const claimed = new Set<number>();
  for (const c of CARDS) { claimed.add(c.f); claimed.add(c.f + 1); }
  const expected = Array.from({ length: 72 }, (_, i) => 385 + i);
  const missing = expected.filter((n) => !claimed.has(n));
  if (missing.length) { console.log('ABORT, photos not claimed: ' + missing.join(',')); await sql.end(); return; }
  console.log('all 72 photos claimed exactly once, none orphaned');

  let clashes = 0;
  for (const c of CARDS) {
    const hit = await sql`SELECT id, status FROM baseball_cards
      WHERE player = ${c.player} AND set_name = ${c.set ?? BASE}
        AND card_number = ${c.num} AND parallel = ${c.par}`;
    if (hit.length) {
      clashes++;
      console.log(`  ALREADY PRESENT  ${c.player} ${c.num} ${c.par} -> id ${hit[0].id} (${hit[0].status})`);
    }
  }
  console.log(clashes ? clashes + ' already in the vault (expected: Benge IT-7 from box 1)' : 'no existing rows match');

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  let n = 0;
  const bumps: string[] = [];
  for (const c of CARDS) {
    // Card-intake rule 5: if he already owns this exact card, do NOT mint a rival
    // row that could get listed a second time. Record the physical second copy
    // against the original. The table enforces it:
    //   CHECK (duplicate_of_id IS NULL OR for_sale = false)
    const prior = await sql`SELECT id, status, ebay_item_id, ebay_sku FROM baseball_cards
      WHERE player = ${c.player} AND set_name = ${c.set ?? BASE}
        AND card_number = ${c.num} AND parallel = ${c.par}
        AND duplicate_of_id IS NULL
      ORDER BY id LIMIT 1`;
    const dup = prior.length ? (prior[0] as any) : null;

    let notes = 'From box 2 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-05. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    if (c.pc) notes += ' | PC keeper: Mariners prospect, not for sale.';
    if (dup) {
      notes += ' | SECOND PHYSICAL COPY of id ' + dup.id + '. Held off sale so the card cannot be '
        + 'listed twice; raise the quantity on the existing listing instead.';
      if (dup.ebay_item_id) bumps.push(`${c.player} #${c.num} -> item ${dup.ebay_item_id} sku ${dup.ebay_sku}`);
    }

    await sql`INSERT INTO baseball_cards
      (user_id, player, set_name, year, card_number, parallel, sport, status,
       for_sale, needs_back_photo, notes, duplicate_of_id)
      VALUES (${UID}, ${c.player}, ${c.set ?? BASE}, 2026, ${c.num}, ${c.par},
              'Baseball', 'photographed', ${!c.pc && !dup}, false, ${notes},
              ${dup ? dup.id : null})`;
    n++;
  }
  console.log('inserted ' + n);
  if (bumps.length) {
    console.log('\nSECOND COPIES OF CARDS THAT ARE ALREADY LIVE - qty bump needed on eBay:');
    bumps.forEach((b) => console.log('  ' + b));
  }

  const chk = await sql`SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') AS p
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1, 2 HAVING count(DISTINCT player) > 1`;
  if (chk.length) {
    console.log('COLLISIONS - two players sharing a number in one set:');
    chk.forEach((r: any) => console.log('  ' + r.set_name + ' #' + r.card_number + ' -> ' + r.p));
  } else {
    console.log('collision check clean');
  }

  const tot = await sql`SELECT count(*)::int n FROM baseball_cards`;
  console.log('vault total now ' + tot[0].n);
  await sql.end();
})();
