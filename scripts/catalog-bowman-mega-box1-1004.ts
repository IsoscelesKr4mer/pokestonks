/**
 * Catalogue box 1 of 6 - 2026 Bowman Chrome mega, 36 cards, IMG_0311-0382.
 *
 *   npx tsx scripts/catalog-bowman-mega-box1-1004.ts --apply
 *
 * Photos shot front/back, odd=front even=back, no gaps in the run.
 *
 * TWO CARD NUMBERS WERE SETTLED BY THE CHECKLIST, NOT BY EYE:
 *   - Walcott read as BCP-331 off the contact sheet. The checklist says BCP-231 and a
 *     4x crop of the card confirms 231. A rotated back turns a 2 into a 3.
 *   - Neyens read as SB-17. The checklist Spring Breakout section stops at SB-15, so
 *     this looked wrong, but a 4x crop shows SB-17 plainly. THE CHECKLIST PDF IS
 *     PARTIAL - its presence is evidence, its absence is not.
 *
 * Elian Rosario BCP-241 appears twice and is NOT a duplicate: one Mojo, one base.
 *
 * Everything goes in for_sale=true: he is photographing all the chrome base to sell
 * through a Pick Your Player dropdown, so the usual no-plain-base rule is suspended
 * for this intake. Leonardo Reynoso BCP-172 is a Mariners 1st Bowman and the one
 * plausible PC keeper - flagged to him rather than decided here.
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

type C = { f: number; player: string; num: string; par: string; set?: string; tags: string };

const CARDS: C[] = [
  { f: 311, player: 'Xavier Neyens', num: 'SB-17', par: 'Spring Breakout insert (refractor)', set: SB, tags: 'Astros SS' },
  { f: 313, player: 'Bo Bichette', num: '16', par: 'Mojo Refractor', tags: 'Mets 3B' },
  { f: 315, player: 'Tatsuya Imai', num: '28', par: 'Mojo Refractor', tags: 'Astros P, RC' },
  { f: 317, player: 'Wyatt Langford', num: '56', par: 'Mojo Refractor', tags: 'Rangers OF' },
  { f: 319, player: 'Sir Jamison Jones', num: 'BCP-217', par: 'Lazer Refractor', tags: 'Nationals C, 1st Bowman' },
  { f: 321, player: 'Wandy Asigen', num: 'BCP-152', par: 'Mojo Refractor', tags: 'Mets SS, 1st Bowman' },
  { f: 323, player: 'Elian Rosario', num: 'BCP-241', par: 'Mojo Refractor', tags: 'Rangers OF/3B, 1st Bowman' },
  { f: 325, player: 'Konnor Griffin', num: '1', par: 'Mojo Refractor', tags: 'Pirates SS, RC' },
  { f: 327, player: 'Jesús Made', num: 'BCP-244', par: 'Mojo Refractor', tags: 'Brewers SS' },
  { f: 329, player: 'Owen Caissie', num: '37', par: 'Mojo Refractor', tags: 'Marlins OF, RC' },
  { f: 331, player: 'Randy Arias', num: 'BCP-242', par: 'Mojo Refractor', tags: 'Astros SS, 1st Bowman' },
  { f: 333, player: 'Sebastian Walcott', num: 'BCP-231', par: 'Lazer Refractor', tags: 'Rangers SS' },
  { f: 335, player: 'Carson Benge', num: 'IT-7', par: 'It Came To The League insert (refractor)', set: ITL, tags: 'Mets OF, RC' },
  { f: 337, player: 'Caleb Bonemer', num: 'BCP-218', par: 'Mojo Refractor', tags: 'White Sox SS, RC' },
  { f: 339, player: 'John Gil', num: 'BCP-155', par: 'base', tags: 'Braves SS' },
  { f: 341, player: 'Fernando Tatis Jr.', num: '23', par: 'base', tags: 'Padres OF' },
  { f: 343, player: 'Kyle Tucker', num: '46', par: 'base', tags: 'Dodgers OF' },
  { f: 345, player: 'Jackson Chourio', num: '19', par: 'base', tags: 'Brewers OF' },
  { f: 347, player: 'Angeibel Gomez', num: 'BCP-194', par: 'base', tags: 'Royals OF, 1st Bowman' },
  { f: 349, player: 'Enmanuel Merlo', num: 'BCP-216', par: 'base', tags: 'Twins SS, 1st Bowman' },
  { f: 351, player: 'Ezequiel Melbourne', num: 'BCP-167', par: 'base', tags: 'Dodgers SS, 1st Bowman' },
  { f: 353, player: 'Elian Rosario', num: 'BCP-241', par: 'base', tags: 'Rangers OF/3B, 1st Bowman, second copy' },
  { f: 355, player: 'JJ Wetherholt', num: '52', par: 'base', tags: 'Cardinals SS, RC' },
  { f: 357, player: 'Vinnie Pasquantino', num: '50', par: 'base', tags: 'Royals 1B' },
  { f: 359, player: 'Jacob Wilson', num: '13', par: 'base', tags: 'Athletics SS' },
  { f: 361, player: 'Elmer Rodríguez', num: '55', par: 'base', tags: 'Yankees P, RC' },
  { f: 363, player: 'Kazuma Okamoto', num: '94', par: 'base', tags: 'Blue Jays 3B, RC' },
  { f: 365, player: 'Steven Kwan', num: '87', par: 'base', tags: 'Guardians OF' },
  { f: 367, player: 'Tarik Skubal', num: '72', par: 'base', tags: 'Tigers P' },
  { f: 369, player: 'Mike Sirota', num: 'BCP-213', par: 'base', tags: 'Dodgers OF' },
  { f: 371, player: 'Max Clark', num: 'BCP-236', par: 'base', tags: 'Tigers OF' },
  { f: 373, player: 'Angel De Los Santos', num: 'BCP-204', par: 'base', tags: 'Tigers SS, 1st Bowman' },
  { f: 375, player: 'Andrew Painter', num: '20', par: 'base', tags: 'Phillies P, RC' },
  { f: 377, player: 'Nolan McLean', num: '80', par: 'base', tags: 'Mets P, RC' },
  { f: 379, player: 'Leonardo Reynoso', num: 'BCP-172', par: 'base', tags: 'Mariners SS, 1st Bowman' },
  { f: 381, player: 'Braylen Wimmer', num: 'BCP-195', par: 'base', tags: 'Rockies SS, 1st Bowman' },
];

(async () => {
  console.log(CARDS.length + ' cards staged');

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
  console.log(clashes ? clashes + ' already present' : 'no existing rows match');

  if (!APPLY) {
    console.log('dry run, nothing written');
    await sql.end();
    return;
  }

  let n = 0;
  for (const c of CARDS) {
    const notes = 'From box 1 of 6, 2026 Bowman Chrome mega, catalogued 2026-10-04. '
      + 'Photos IMG_0' + c.f + ' (front) / IMG_0' + (c.f + 1) + ' (back) in eBay_assets/card drop. '
      + c.tags;
    await sql`INSERT INTO baseball_cards
      (user_id, player, set_name, year, card_number, parallel, sport, status,
       for_sale, needs_back_photo, notes)
      VALUES (${UID}, ${c.player}, ${c.set ?? BASE}, 2026, ${c.num}, ${c.par},
              'Baseball', 'photographed', true, false, ${notes})`;
    n++;
  }
  console.log('inserted ' + n);

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
