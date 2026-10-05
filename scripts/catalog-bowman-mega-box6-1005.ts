/**
 * Catalogue box 6 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0673-0744.
 * LAST BOX OF THE RIP.
 *
 *   npx tsx scripts/catalog-bowman-mega-box6-1005.ts --apply
 *
 * 72 files, 673-744, odd=front even=back, NO GAPS. All 36 numbers verified
 * against the checklist: 20 lettered + 16 numeric, zero mismatches.
 *
 * THE BOX HIT: ETHAN HOLLIDAY BCP-209, SERIAL 095/100.
 *
 * The serial is CERTAIN - read at 5x off the front, right side above the
 * nameplate, "095/100" unambiguous. The pattern is CERTAIN - cropped against a
 * plain Mojo (Angeibel Gomez #6) and a Lazer (Reynoso #2) from this same box, it
 * is the geometric Mojo tile, not the Lazer's scattered lines.
 *
 * THE COLOUR IS NOT CERTAIN, AND IS DELIBERATELY NOT NAMED.
 *   - /100 does not appear anywhere on the 2026 hobby ladder (Refractor /499,
 *     Purple /250, Blue /150, Aqua /125, Green /99, Yellow /75, Gold /50,
 *     Orange /25), so the mega Mojo colours run to different counts than hobby.
 *   - The odds sheet lists mega colours by ODDS but gives no run sizes.
 *   - eBay titles at /100 for this product mostly say "Steel" or "Wave", neither
 *     of which matches the Mojo tile in hand.
 *   - The card itself reads green-gold full-frame and blue-purple in a border
 *     crop, because chrome shifts with the angle.
 * Per the card-intake skill: record the serial plus the observed colour and flag
 * `confirm parallel` rather than inventing a Topps product name. It goes in with
 * NO price so the pricer skips it. Michael has the card; ten seconds in hand
 * beats a guess from a photograph.
 *
 * Ethan Holliday is a premium name (4th overall 2025, Matt Holliday's son), so
 * this is worth getting right rather than fast.
 *
 * Parallels called on the front; Bowman Chrome has no back marker.
 *   Mojo = tight geometric tile | Lazer = scattered streaks | base = flat
 * Lands on 10 Mojo (one of them the /100) / 2 Lazer / 2 insert / 22 base = 36,
 * the same distribution as all five earlier boxes.
 *
 * IN-BOX DUPLICATES at different parallels, so different cards:
 *   Leonardo Reynoso BCP-172 (Lazer + base), Tarik Skubal 72 (Mojo + base).
 *
 * Leonardo Reynoso is a Mariners prospect and therefore a PC candidate, but he
 * goes in FOR SALE: the vault already has a Reynoso CPA-LR Gold Ink auto /15
 * listed at $1,499.99, so Reynoso cards are evidently sold, not kept. Unlike
 * Lazaro Montes and the Celestens, he is not in the named PC group.
 *
 * Player names are entered UNACCENTED (Ronald Acuna Jr., Elmer Rodriguez) per
 * scripts/fix-accented-player-names-1005.ts - an accented spelling silently
 * defeats the duplicate_of_id guard, which nearly double-listed a Julio
 * Rodriguez earlier tonight.
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
const NUMBERED = 'Mojo Refractor /100 (095/100)';

type C = { f: number; player: string; num: string; par: string; set?: string; tags: string };

const CARDS: C[] = [
  { f: 673, player: 'Ethan Holliday', num: 'BCP-209', par: NUMBERED, tags: 'Rockies SS. NUMBERED 095/100 - confirm parallel: serial and Mojo pattern are certain, the COLOUR NAME is not. Do not list until named.' },
  { f: 675, player: 'Leonardo Reynoso', num: 'BCP-172', par: LAZER, tags: 'Mariners SS, 1st Bowman' },
  { f: 677, player: 'Enmanuel Merlo', num: 'BCP-216', par: LAZER, tags: 'Twins SS, 1st Bowman' },
  { f: 679, player: 'Luis Hernandez', num: 'SB-8', par: 'Spring Breakout insert (refractor)', set: SB, tags: 'Giants SS' },
  { f: 681, player: 'Franklin Arias', num: 'IT-1', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Red Sox SS' },
  { f: 683, player: 'Angeibel Gomez', num: 'BCP-194', par: MOJO, tags: 'Royals OF, 1st Bowman' },
  { f: 685, player: 'Santiago Solarte', num: 'BCP-207', par: MOJO, tags: 'Marlins SS, 1st Bowman' },
  { f: 687, player: 'Slater De Brun', num: 'BCP-151', par: MOJO, tags: 'Rays OF, 1st Bowman' },
  { f: 689, player: 'Ariel Roque', num: 'BCP-240', par: MOJO, tags: 'Orioles OF, 1st Bowman' },
  { f: 691, player: 'Pedro Gomez', num: 'BCP-227', par: MOJO, tags: 'Orioles OF, 1st Bowman' },
  { f: 693, player: 'Justin Crawford', num: '54', par: MOJO, tags: 'Phillies OF, RC' },
  { f: 695, player: 'Nick Kurtz', num: '18', par: MOJO, tags: 'Athletics 1B' },
  { f: 697, player: 'Tarik Skubal', num: '72', par: MOJO, tags: 'Tigers P' },
  { f: 699, player: 'Francisco Lindor', num: '17', par: MOJO, tags: 'Mets SS' },
  { f: 701, player: 'Elmer Rodriguez', num: '55', par: PLAIN, tags: 'Yankees P, RC' },
  { f: 703, player: 'Steven Kwan', num: '87', par: PLAIN, tags: 'Guardians OF' },
  { f: 705, player: 'Chase Burns', num: '27', par: PLAIN, tags: 'Reds P, RC' },
  { f: 707, player: 'Braylen Wimmer', num: 'BCP-195', par: PLAIN, tags: 'Rockies SS, 1st Bowman' },
  { f: 709, player: 'Leonardo Reynoso', num: 'BCP-172', par: PLAIN, tags: 'Mariners SS, 1st Bowman, second copy in this box (the other is Lazer)' },
  { f: 711, player: 'Wilder Dalis', num: 'BCP-188', par: PLAIN, tags: 'Rockies SS, 1st Bowman' },
  { f: 713, player: 'Luis De La Torre', num: 'BCP-173', par: PLAIN, tags: 'Giants P, 1st Bowman' },
  { f: 715, player: 'Hyun Seung Lee', num: 'BCP-183', par: PLAIN, tags: 'Pirates SS, 1st Bowman' },
  { f: 717, player: 'Talon Haley', num: 'BCP-162', par: PLAIN, tags: 'Angels P, 1st Bowman' },
  { f: 719, player: 'Jung Hoo Lee', num: '64', par: PLAIN, tags: 'Giants OF' },
  { f: 721, player: 'Andrew McCutchen', num: '81', par: PLAIN, tags: 'Rangers OF' },
  { f: 723, player: 'JoJo Parker', num: 'BCP-164', par: PLAIN, tags: 'Blue Jays SS' },
  { f: 725, player: 'Jackson Chourio', num: '19', par: PLAIN, tags: 'Brewers OF' },
  { f: 727, player: 'Tarik Skubal', num: '72', par: PLAIN, tags: 'Tigers P, second copy in this box (the other is Mojo)' },
  { f: 729, player: 'Kyle Tucker', num: '46', par: PLAIN, tags: 'Dodgers OF' },
  { f: 731, player: 'Luis Robert Jr.', num: '10', par: PLAIN, tags: 'Mets OF' },
  { f: 733, player: 'Kyle Schwarber', num: '71', par: PLAIN, tags: 'Phillies DH' },
  { f: 735, player: 'Alfredo Duno', num: 'BCP-235', par: PLAIN, tags: 'Reds C' },
  { f: 737, player: 'Mike Sirota', num: 'BCP-213', par: PLAIN, tags: 'Dodgers OF' },
  { f: 739, player: 'Corbin Carroll', num: '83', par: PLAIN, tags: 'Diamondbacks OF' },
  { f: 741, player: 'Ronald Acuna Jr.', num: '57', par: PLAIN, tags: 'Braves OF' },
  { f: 743, player: 'Max Clark', num: 'BCP-236', par: PLAIN, tags: 'Tigers OF' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');
  const byPar: Record<string, number> = {};
  CARDS.forEach((c) => { byPar[c.par] = (byPar[c.par] ?? 0) + 1; });
  Object.entries(byPar).forEach(([p, n]) => console.log(`  ${String(n).padStart(2)}  ${p}`));

  // names must already be unaccented, or the duplicate guard silently misses
  const accented = CARDS.filter((c) => c.player !== c.player.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  if (accented.length) {
    console.log('ABORT, accented player names: ' + accented.map((c) => c.player).join(', '));
    await sql.end(); return;
  }

  const claimed = new Set<number>();
  for (const c of CARDS) { claimed.add(c.f); claimed.add(c.f + 1); }
  const missing = Array.from({ length: 72 }, (_, i) => 673 + i).filter((n) => !claimed.has(n));
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

    let notes = 'From box 6 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-05. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    if (c.par === NUMBERED) {
      notes += ' | confirm parallel - SERIAL 095/100 read at 5x and the geometric Mojo tile confirmed '
        + 'against a plain Mojo and a Lazer from this same box. The COLOUR is unresolved: /100 is not on '
        + 'the 2026 hobby ladder, the odds sheet gives mega colours without run sizes, and eBay titles at '
        + '/100 say Steel or Wave, neither of which matches the pattern in hand. Name the colour off the '
        + 'physical card before listing.';
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

  const split = await sql`SELECT count(*)::int n FROM (
      SELECT 1 FROM baseball_cards
      GROUP BY translate(player, 'áéíóúÁÉÍÓÚñÑüÜçÇ', 'aeiouAEIOUnNuUcC')
      HAVING count(DISTINCT player) > 1) t`;
  console.log(`names under two spellings: ${split[0].n}`);

  const dbl = await sql`SELECT count(*)::int n FROM (
      SELECT 1 FROM baseball_cards
      WHERE for_sale IS TRUE AND duplicate_of_id IS NULL
        AND card_number IS NOT NULL AND card_number <> 'UNKNOWN'
      GROUP BY player, set_name, card_number, parallel
      HAVING count(*) > 1 AND count(DISTINCT ebay_item_id) > 1) t`;
  console.log(`cards sellable across more than one listing: ${dbl[0].n}`);

  const tot = await sql`SELECT count(*)::int n FROM baseball_cards`;
  console.log('vault total now ' + tot[0].n);
  await sql.end();
})();
