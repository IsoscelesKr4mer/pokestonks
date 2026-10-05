/**
 * Catalogue box 3 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0457-0528.
 *
 *   npx tsx scripts/catalog-bowman-mega-box3-1005.ts --apply
 *
 * 72 files, 457-528, odd=front even=back, NO GAPS (checked before mapping).
 *
 * THE CARD THAT MATTERS: JAC CAGLIANONE #79 IS A CHROME ROOKIE RED RC VARIATION.
 *
 * It read as plain base off the contact sheet. Three checks, in this order, say
 * otherwise, and the card-intake skill predicts every one of them:
 *   1. BORDER TEST. A strip of his left border against a known base (Harper #63),
 *      a known Mojo (De La Cruz #97) and a known Lazer (Max Clark) gives four
 *      distinct looks. Caglianone shows a broad SMOOTH spectral sweep, pink to
 *      green to blue to gold. Harper's base strip is flat neutral grey with no
 *      spectral content at all. So it refracts.
 *   2. NO SERIAL anywhere on the front - not above the nameplate, not in the top
 *      band. So it is not a numbered colour.
 *   3. THE RC SHIELD IS RED. Cropped against the nine other rookies in this same
 *      box, every one of which is navy with a red top band. Caglianone's shield
 *      body is solid red.
 * The skill says it outright: "It refracts, which makes it read as a Refractor,
 * and it carries no serial, which makes it read as base. It is neither, and it is
 * worth real money." It should NOT go into a cheap Pick-Your-Player dropdown.
 *
 * TATSUYA IMAI'S INSERT IS IT-14, NOT IT-11. The contact sheet read IT-11; the
 * checklist assigns IT-11 to Colson Montgomery and puts Imai at IT-14, and a 3x
 * crop of the card shows IT-14 plainly. The stylised 4 reads as a 1 at sheet
 * resolution. Same failure the skill already records for a Finest 5 reading as 8.
 * 18/18 lettered codes now confirmed against the checklist.
 *
 * Parallels, called on the front because Bowman Chrome has no back marker:
 *   Mojo = tight geometric tile  |  Lazer = scattered streaks  |  base = flat
 * Lands on 10 Mojo / 2 Lazer / 2 insert / 21 base / 1 Red RC = 36. Boxes 1 and 2
 * both ran 10/2/2/22, so this box traded one base for the Red RC.
 *
 * DUPLICATES: this box overlaps boxes 1-2 and the 9/10 rip heavily. Anything he
 * already owns at the same parallel goes in with duplicate_of_id set and
 * for_sale=false, so a single physical card can never be listed twice. The table
 * enforces it: CHECK (duplicate_of_id IS NULL OR for_sale = false). Pete Alonso
 * #99 appears TWICE IN THIS BOX, once Mojo and once base - different cards.
 *
 * Cal Raleigh #86 and Bryan Woo #49 are Mariners but they are established big
 * leaguers, not the Mariners PROSPECTS that make up his PC, and a Bryan Woo #49
 * from the 9/10 rip is already listed. Both go in for sale. Flagged anyway.
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

type C = { f: number; player: string; num: string; par: string; set?: string; tags: string };

const CARDS: C[] = [
  { f: 457, player: 'Jac Caglianone', num: '79', par: REDRC, tags: 'Royals OF, RC. RED RC SHIELD - do not put this one in a PYP dropdown' },
  { f: 459, player: 'Tatsuya Imai', num: 'IT-14', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Astros P, RC' },
  { f: 461, player: 'Elly De La Cruz', num: '97', par: MOJO, tags: 'Reds SS' },
  { f: 463, player: 'Pete Alonso', num: '99', par: MOJO, tags: 'Orioles 1B' },
  { f: 465, player: 'Samil Serrano', num: 'BCP-179', par: MOJO, tags: 'Nationals OF, 1st Bowman' },
  { f: 467, player: 'Mike Sirota', num: 'BCP-213', par: LAZER, tags: 'Dodgers OF' },
  { f: 469, player: 'Cal Raleigh', num: '86', par: MOJO, tags: 'Mariners C' },
  { f: 471, player: 'Alex Lodise', num: 'BCP-153', par: MOJO, tags: 'Braves SS, 1st Bowman' },
  { f: 473, player: 'Xavier Neyens', num: 'SB-17', par: 'Spring Breakout insert (refractor)', set: SB, tags: 'Astros SS' },
  { f: 475, player: 'Jesús Made', num: 'BCP-244', par: MOJO, tags: 'Brewers SS' },
  { f: 477, player: 'Caleb Bonemer', num: 'BCP-218', par: MOJO, tags: 'White Sox SS' },
  { f: 479, player: 'Konnor Griffin', num: '1', par: MOJO, tags: 'Pirates SS, RC' },
  { f: 481, player: 'Max Clark', num: 'BCP-236', par: LAZER, tags: 'Tigers OF' },
  { f: 483, player: 'Wandy Asigen', num: 'BCP-152', par: MOJO, tags: 'Mets SS, 1st Bowman' },
  { f: 485, player: 'Tatsuya Imai', num: '28', par: MOJO, tags: 'Astros P, RC' },
  { f: 487, player: 'Nathan Church', num: '88', par: PLAIN, tags: 'Cardinals OF, RC' },
  { f: 489, player: 'Bryce Harper', num: '63', par: PLAIN, tags: 'Phillies 1B' },
  { f: 491, player: 'Byron Buxton', num: '4', par: PLAIN, tags: 'Twins OF' },
  { f: 493, player: 'Cam Schlittler', num: '29', par: PLAIN, tags: 'Yankees P, RC' },
  { f: 495, player: 'Manuel Bolivar', num: 'BCP-221', par: PLAIN, tags: 'Tigers C, 1st Bowman' },
  { f: 497, player: 'Wellington Aracena', num: 'BCP-226', par: PLAIN, tags: 'Diamondbacks P, 1st Bowman' },
  { f: 499, player: 'Randy Arias', num: 'BCP-242', par: PLAIN, tags: 'Astros SS, 1st Bowman' },
  { f: 501, player: 'Didier Fuentes', num: '7', par: PLAIN, tags: 'Braves P, RC' },
  { f: 503, player: 'JR Ritchie', num: '32', par: PLAIN, tags: 'Braves P, RC' },
  { f: 505, player: 'Jeancer Custodio', num: 'BCP-222', par: PLAIN, tags: 'Pirates OF, 1st Bowman' },
  { f: 507, player: 'Ariel Roque', num: 'BCP-240', par: PLAIN, tags: 'Orioles OF, 1st Bowman' },
  { f: 509, player: 'Pete Alonso', num: '99', par: PLAIN, tags: 'Orioles 1B, second copy in this box (the other is Mojo)' },
  { f: 511, player: 'Kyle Karros', num: '74', par: PLAIN, tags: 'Rockies 3B, RC' },
  { f: 513, player: 'Bo Bichette', num: '16', par: PLAIN, tags: 'Mets 3B' },
  { f: 515, player: 'Alex Freeland', num: '31', par: PLAIN, tags: 'Dodgers 2B, RC' },
  { f: 517, player: 'Hyun Seung Lee', num: 'BCP-183', par: PLAIN, tags: 'Pirates SS, 1st Bowman' },
  { f: 519, player: 'JoJo Parker', num: 'BCP-164', par: PLAIN, tags: 'Blue Jays SS' },
  { f: 521, player: 'Bryan Woo', num: '49', par: PLAIN, tags: 'Mariners P' },
  { f: 523, player: 'Bubba Chandler', num: '38', par: PLAIN, tags: 'Pirates P, RC' },
  { f: 525, player: 'Talon Haley', num: 'BCP-162', par: PLAIN, tags: 'Angels P, 1st Bowman' },
  { f: 527, player: 'Luis De La Torre', num: 'BCP-173', par: PLAIN, tags: 'Giants P, 1st Bowman' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');
  const byPar: Record<string, number> = {};
  CARDS.forEach((c) => { byPar[c.par] = (byPar[c.par] ?? 0) + 1; });
  Object.entries(byPar).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));

  const claimed = new Set<number>();
  for (const c of CARDS) { claimed.add(c.f); claimed.add(c.f + 1); }
  const expected = Array.from({ length: 72 }, (_, i) => 457 + i);
  const missing = expected.filter((n) => !claimed.has(n));
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

    let notes = 'From box 3 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-05. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    if (c.par === REDRC) {
      notes += ' | RED RC VARIATION confirmed three ways: border shows a smooth spectral sweep '
        + 'where base is flat; no serial anywhere on the front; RC shield body is RED against nine '
        + 'navy shields in the same box. Worth real money, list it on its own.';
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
