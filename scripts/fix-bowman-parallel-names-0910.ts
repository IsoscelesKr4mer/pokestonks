/**
 * Correct the parallel names on the 2026-09-10 Bowman Chrome hobby rip.
 *
 *   npx tsx scripts/fix-bowman-parallel-names-0910.ts          # dry run
 *   npx tsx scripts/fix-bowman-parallel-names-0910.ts --apply
 *
 * Michael caught two things I had wrong, both confirmed against the product's
 * own odds sheet and then re-read off the cards:
 *
 *  1. Murakami #76 and Messick #3 are not Refractors. The odds sheet lists
 *     "Base Cards Chrome Rookie Red RC Variation 1:4", which is the official
 *     name, and 1:4 over 12 packs is exactly the two he pulled. The tell is the
 *     MLB shield inside the RC badge: red on the variation, navy on all ten
 *     other rookies in the box.
 *
 *  2. Shimmer is a real, separate parallel and it exists ONLY for Bowman Chrome
 *     Prospects, never for base cards, which is why Woo #49 (a base card) can
 *     only be True Blue. Blown up, Arquette and Bonemer both show the streaked
 *     foil with metallic glints; Woo and Dalis are dead smooth. So the two
 *     prospects are Shimmers and the other two are True colours.
 *
 * The money in this: Orange Shimmer /25 has 3 live asks at $122/$145/$150,
 * while True Orange /25 has 3 at $200/$299/$455. Calling Arquette True Orange
 * would have overpriced it by about $80.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Fix = { player: string; num: string; from: string; to: string; cents?: number; comp?: string };
const FIXES: Fix[] = [
  { player: 'Munetaka Murakami', num: '76', from: 'Red Rookie Variation',
    to: 'Chrome Rookie Red RC Variation' },
  { player: 'Parker Messick', num: '3', from: 'Red Rookie Variation',
    to: 'Chrome Rookie Red RC Variation' },
  { player: 'Aiva Arquette', num: 'BCP-174', from: 'Orange Refractor /25 (22/25)',
    to: 'Orange Shimmer Refractor /25 (22/25)', cents: 14500,
    comp: 'Orange Shimmer /25, 3 live asks $122.04/$145/$149.99 (2026-09-10). True Orange /25 is a different card at $200/$299/$455' },
  { player: 'Josh Naylor', num: 'WBC-12', from: 'Orange Refractor /25 (07/25)',
    to: 'True Orange Refractor /25 (07/25)' },
  { player: 'Bryan Woo', num: '49', from: 'Blue Refractor /150 (094/150)',
    to: 'True Blue Refractor /150 (094/150)' },
  { player: 'Caleb Bonemer', num: 'BCP-218', from: 'Purple Refractor /250 (066/250)',
    to: 'Purple Shimmer Refractor /250 (066/250)', cents: 1800,
    comp: 'no live Purple Shimmer /250 for BCP-218 (2026-09-10); his two plain Purple /250 asks are $12 and $40, and on Arquette the Shimmer runs just under the plain Purple' },
  { player: 'Wilder Dalis', num: 'CPA-WD', from: 'Purple Refractor /250 (241/250), Autograph',
    to: 'True Purple Refractor /250 (241/250), Autograph' },
];

(async () => {
  let n = 0;
  for (const f of FIXES) {
    const rows = await sql`SELECT id, parallel, asking_price_cents FROM baseball_cards
      WHERE year = 2026 AND player = ${f.player} AND card_number = ${f.num}
        AND set_name ILIKE '%bowman chrome%' AND parallel = ${f.from}`;
    if (rows.length !== 1) {
      console.log('>>> ' + f.player + ' ' + f.num + ': expected 1 row matching "' + f.from + '", found ' + rows.length + '. SKIPPED');
      continue;
    }
    const r = rows[0];
    const priceBit = f.cents == null ? '' :
      '   $' + (r.asking_price_cents / 100).toFixed(2) + ' -> $' + (f.cents / 100).toFixed(2);
    console.log('id ' + r.id + '  ' + f.player + ' ' + f.num);
    console.log('   ' + f.from + '\n   -> ' + f.to + priceBit);
    if (!APPLY) continue;
    if (f.cents == null) {
      await sql`UPDATE baseball_cards SET parallel = ${f.to}, updated_at = now() WHERE id = ${r.id}`;
    } else {
      await sql`UPDATE baseball_cards SET parallel = ${f.to}, asking_price_cents = ${f.cents},
        comp_note = ${f.comp!}, updated_at = now() WHERE id = ${r.id}`;
    }
    n++;
  }
  console.log(APPLY ? '\nupdated ' + n + ' rows' : '\nDRY RUN, pass --apply to write');
  await sql.end();
})();
