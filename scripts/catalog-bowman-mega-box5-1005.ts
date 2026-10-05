/**
 * Catalogue box 5 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0601-0672.
 *
 *   npx tsx scripts/catalog-bowman-mega-box5-1005.ts --apply
 *
 * 72 files, 601-672, odd=front even=back, NO GAPS. All 36 numbers verified
 * against the checklist: 19 lettered + 17 numeric, zero mismatches.
 *
 * THE BOX HIT: ANGEL SALIO CPA-AS - CHROME PROSPECT AUTOGRAPH.
 *   The back carries "TOPPS GUARANTEES THE AUTHENTICITY OF THE AUTOGRAPH(S)
 *   APPEARING ON THIS CARD"; the front has a blue ON-CARD signature over the
 *   white panel with "TOPPS CERTIFIED / AUTOGRAPH ISSUE" printed beneath it.
 *   1st Bowman, Mojo Refractor background, Cincinnati Reds. NO SERIAL anywhere,
 *   so it is the unnumbered base auto, not a numbered colour.
 *   For reference the two other unnumbered-ish CPA autos in the vault
 *   (CPA-WD Dalis, CPA-RM Moneys) are both asking $125.00.
 *
 * BRYCE ELDRIDGE #78 - CHROME ROOKIE RED RC VARIATION. Third Red RC in three
 * boxes (Caglianone box 3, Jose Fernandez box 4, Eldridge box 5). This one had
 * the cleanest possible control: Eldridge appears TWICE IN THIS BOX, and card
 * #23 is his ordinary base. Cropped side by side, #3's RC shield body is solid
 * RED and #23's is navy. Same card number, same box, same lighting.
 *
 * Parallels called on the front; Bowman Chrome has no back marker.
 *   Mojo = tight geometric tile | Lazer = scattered streaks | base = flat
 * Lands on 1 auto / 9 Mojo / 2 Lazer / 1 Red RC / 2 insert / 21 base = 36.
 *
 * Aiva Arquette BCP-174 carries NO 1st Bowman logo, which matches the
 * card-intake skill exactly: BCP-174 is his September Bowman Chrome card, not
 * his 1st Bowman (that is BCP-40 in the May flagship). Read the logo, never the
 * card number.
 *
 * Julio Rodriguez #35 and Cal-Raleigh-tier Mariners go in FOR SALE. His PC is
 * Mariners PROSPECTS plus in-person autos, not established big leaguers.
 *
 * NOTE ON A SET-NAME DRIFT, not fixed here: the vault holds both
 * '2026 Bowman Chrome (Prospect Autographs)' (2 rows) and
 * '2026 Bowman Chrome Prospect Autographs' (1 row, id618). This script uses the
 * parenthesised form to match the insert-naming convention. Worth normalising.
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
const CPA = '2026 Bowman Chrome (Prospect Autographs)';

const MOJO = 'Mojo Refractor';
const LAZER = 'Lazer Refractor';
const PLAIN = 'base';
const REDRC = 'Chrome Rookie Red RC Variation';

type C = { f: number; player: string; num: string; par: string; set?: string; tags: string };

const CARDS: C[] = [
  { f: 601, player: 'Angel Salio', num: 'CPA-AS', par: 'Mojo Refractor, Autograph', set: CPA, tags: 'Reds SS, 1st Bowman. ON-CARD AUTO, unnumbered - list on its own' },
  { f: 603, player: 'Shohei Ohtani', num: '100', par: MOJO, tags: 'Dodgers DH/P' },
  { f: 605, player: 'Bryce Eldridge', num: '78', par: REDRC, tags: 'Giants 1B, RC. RED RC SHIELD - list on its own, not in a PYP dropdown' },
  { f: 607, player: 'Alex Freeland', num: '31', par: MOJO, tags: 'Dodgers 2B, RC' },
  { f: 609, player: 'Bubba Chandler', num: '38', par: MOJO, tags: 'Pirates P, RC' },
  { f: 611, player: 'Fabricio Blanco', num: 'BCP-158', par: LAZER, tags: 'Rays SS, 1st Bowman' },
  { f: 613, player: 'Angel Nunez', num: 'BCP-220', par: LAZER, tags: 'Reds OF, 1st Bowman' },
  { f: 615, player: 'Carson Benge', num: 'IT-7', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Mets OF, RC' },
  { f: 617, player: 'James Tibbs III', num: 'SB-7', par: 'Spring Breakout insert (refractor)', set: SB, tags: 'Dodgers OF' },
  { f: 619, player: 'Ezequiel Melbourne', num: 'BCP-167', par: MOJO, tags: 'Dodgers SS, 1st Bowman' },
  { f: 621, player: 'Enmanuel Merlo', num: 'BCP-216', par: MOJO, tags: 'Twins SS, 1st Bowman' },
  { f: 623, player: 'Dawvris Brito', num: 'BCP-191', par: MOJO, tags: 'Red Sox SS, 1st Bowman' },
  { f: 625, player: 'Walker Jenkins', num: 'BCP-199', par: MOJO, tags: 'Twins OF' },
  { f: 627, player: 'Mike Trout', num: '75', par: MOJO, tags: 'Angels OF' },
  { f: 629, player: 'Ethan Holliday', num: 'BCP-209', par: MOJO, tags: 'Rockies SS' },
  { f: 631, player: 'Yordani Soto', num: 'BCP-250', par: PLAIN, tags: 'White Sox SS, 1st Bowman' },
  { f: 633, player: 'Christian Zazueta', num: 'BCP-159', par: PLAIN, tags: 'Dodgers P, 1st Bowman' },
  { f: 635, player: 'Rubel Arias', num: 'BCP-157', par: PLAIN, tags: 'Dodgers OF, 1st Bowman' },
  { f: 637, player: 'Andri Hidalgo', num: 'BCP-249', par: PLAIN, tags: 'Orioles P, 1st Bowman' },
  { f: 639, player: 'Yunior Amparo', num: 'BCP-232', par: PLAIN, tags: 'Mets SS, 1st Bowman' },
  { f: 641, player: 'Connelly Early', num: '33', par: PLAIN, tags: 'Red Sox P, RC' },
  { f: 643, player: 'Christian Moore', num: '44', par: PLAIN, tags: 'Angels 2B, RC' },
  { f: 645, player: 'Bryce Eldridge', num: '78', par: PLAIN, tags: 'Giants 1B, RC, second copy in this box - the control for the Red RC above' },
  { f: 647, player: 'Tatsuya Imai', num: '28', par: PLAIN, tags: 'Astros P, RC' },
  { f: 649, player: 'Munetaka Murakami', num: '76', par: PLAIN, tags: 'White Sox 1B, RC' },
  { f: 651, player: 'Eli Willits', num: 'BCP-245', par: PLAIN, tags: 'Nationals SS' },
  { f: 653, player: 'Aiva Arquette', num: 'BCP-174', par: PLAIN, tags: 'Marlins SS. NOT a 1st Bowman - no logo on the front' },
  { f: 655, player: 'Eduardo Quintero', num: 'BCP-205', par: PLAIN, tags: 'Dodgers OF' },
  { f: 657, player: 'Julio Rodríguez', num: '35', par: PLAIN, tags: 'Mariners OF' },
  { f: 659, player: 'Junior Caminero', num: '98', par: PLAIN, tags: 'Rays 3B' },
  { f: 661, player: 'Chris Sale', num: '62', par: PLAIN, tags: 'Braves P' },
  { f: 663, player: 'Caleb Bonemer', num: 'BCP-218', par: PLAIN, tags: 'White Sox SS' },
  { f: 665, player: 'Willy Adames', num: '69', par: PLAIN, tags: 'Giants SS' },
  { f: 667, player: 'Aaron Judge', num: '66', par: PLAIN, tags: 'Yankees OF' },
  { f: 669, player: 'Cody Bellinger', num: '9', par: PLAIN, tags: 'Yankees OF' },
  { f: 671, player: 'Corey Seager', num: '82', par: PLAIN, tags: 'Rangers SS' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');
  const byPar: Record<string, number> = {};
  CARDS.forEach((c) => { byPar[c.par] = (byPar[c.par] ?? 0) + 1; });
  Object.entries(byPar).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));

  const claimed = new Set<number>();
  for (const c of CARDS) { claimed.add(c.f); claimed.add(c.f + 1); }
  const missing = Array.from({ length: 72 }, (_, i) => 601 + i).filter((n) => !claimed.has(n));
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

    let notes = 'From box 5 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-05. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    if (c.set === CPA) {
      notes += ' | ON-CARD AUTOGRAPH: back reads "TOPPS GUARANTEES THE AUTHENTICITY OF THE '
        + 'AUTOGRAPH(S) APPEARING ON THIS CARD", front has a blue on-card signature over "TOPPS '
        + 'CERTIFIED / AUTOGRAPH ISSUE". No serial anywhere, so unnumbered.';
    }
    if (c.par === REDRC) {
      notes += ' | RED RC VARIATION confirmed against his OWN base copy from this same box '
        + '(IMG_0645): #3 shield body is solid RED, #23 is navy. Same card number, same lighting.';
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
