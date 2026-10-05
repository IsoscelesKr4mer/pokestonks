/**
 * The July rip was 2026 BOWMAN, not 2026 Bowman Chrome. Two different products.
 *
 *   npx tsx scripts/fix-bowman-vs-bowmanchrome-1005.ts --apply
 *
 * Michael caught this: "Those cards from 7/25 are from bowman not bowman chrome..
 * it's a different set". He is right, and three independent checks agree:
 *
 *   1. DATES. 2026 Bowman Chrome released in September; he ripped it on 9/10.
 *      A 2026-07-25 rip cannot contain it.
 *   2. THE CHECKLISTS. Of the 23 lettered codes in the July batch, 23 match the
 *      2026 Bowman checklist and ZERO match the 2026 Bowman Chrome checklist.
 *      Sebastian Walcott is BCP-51 in Bowman and BCP-231 in Bowman Chrome - same
 *      player, two products, two numbers. BCP-95 Willits, BCP-98 Jenkins and
 *      BCP-115 Wetherholt do not exist in Bowman Chrome at all.
 *   3. THE TABLE CONTRADICTS ITSELF. Aaron Judge #1 from this same rip is filed
 *      twice: id203 as "2026 Bowman" and id182 as "2026 Bowman Chrome".
 *
 * This also dissolves every card-number collision in the vault. All nine were one
 * July card against one September card - #1 Judge/Griffin, #18 Anthony/Kurtz,
 * #19 Teel/Chourio, #23 Acuna/Tatis, #44 De La Cruz/Moore, #62 Caissie/Sale,
 * #80 Carroll/McLean, #100 Trout/Ohtani. Not one was a misread number. They were
 * two sets wearing the same name.
 *
 * SEPARATELY, one genuine misread surfaced while checking the above. The checklist
 * puts Seojun Moon (Blue Jays) at BCP-127; BCP-45 is Seong-Jun Kim (Rangers). Two
 * Korean names, one transposed number. Both Moon copies are corrected here.
 * Per the card-intake skill, the checklist settles doubtful numbers.
 *
 * NOT DONE HERE - needs Michael's go-ahead, it is a live listing:
 *   eBay item 168622311437 is titled "Bowman Chrome Baseball You Pick..." and its
 *   description says "2026 Bowman Chrome singles". Both are wrong for ~40 of its
 *   43 variations, and the "BCP-45 - Seojun Moon" dropdown label carries the bad
 *   number. Its SKUs already say PYP-BOWMAN-nnn.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SET_MAP: Record<string, string> = {
  '2026 Bowman Chrome': '2026 Bowman',
  '2026 Bowman Chrome (Bowman Sterling insert)': '2026 Bowman (Bowman Sterling insert)',
  '2026 Bowman Chrome (Electric Sluggers insert)': '2026 Bowman (Electric Sluggers insert)',
};

const NOTE = ' | Set corrected 2026-10-05: filed as Bowman Chrome, actually 2026 Bowman. '
  + 'Bowman Chrome did not release until September; the lettered codes all match the '
  + 'Bowman checklist and none match Bowman Chrome.';

(async () => {
  const rows = await sql`SELECT id, player, card_number, set_name, created_at::date::text d
    FROM baseball_cards
    WHERE set_name LIKE '2026 Bowman Chrome%'
      AND created_at::date IN ('2026-07-24', '2026-07-25')
    ORDER BY id`;

  console.log(`${rows.length} rows to move off Bowman Chrome`);
  const unknown = (rows as any[]).filter(r => !SET_MAP[r.set_name]);
  if (unknown.length) {
    console.log('ABORT - unmapped set_name:');
    unknown.forEach(r => console.log(`  id${r.id} ${r.set_name}`));
    await sql.end();
    return;
  }
  for (const [from, to] of Object.entries(SET_MAP)) {
    const n = (rows as any[]).filter(r => r.set_name === from).length;
    if (n) console.log(`  ${n.toString().padStart(2)}  ${from}  ->  ${to}`);
  }

  if (!APPLY) {
    console.log('\ndry run, nothing written');
    await sql.end();
    return;
  }

  let moved = 0;
  for (const r of rows as any[]) {
    // assert-then-write: a stale fix must not clobber a corrected row
    const res = await sql`UPDATE baseball_cards
      SET set_name = ${SET_MAP[r.set_name]},
          notes = coalesce(notes, '') || ${NOTE},
          updated_at = now()
      WHERE id = ${r.id} AND set_name = ${r.set_name}
      RETURNING id`;
    moved += res.length;
  }
  console.log(`\nmoved ${moved} rows to the 2026 Bowman family`);

  // Seojun Moon is BCP-127 per the checklist, not BCP-45.
  const moon = await sql`UPDATE baseball_cards
    SET card_number = 'BCP-127',
        notes = coalesce(notes, '') || ${' | Card number corrected 2026-10-05: read as BCP-45, '
          + 'but the 2026 Bowman checklist puts Seojun Moon at BCP-127. BCP-45 is Seong-Jun Kim '
          + '(Rangers). eBay dropdown label still says BCP-45.'},
        updated_at = now()
    WHERE player = 'Seojun Moon' AND card_number = 'BCP-45'
    RETURNING id, player, card_number`;
  console.log(`Seojun Moon BCP-45 -> BCP-127 on ${moon.length} rows`);

  const chk = await sql`SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') AS p
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1, 2 HAVING count(DISTINCT player) > 1`;
  if (chk.length) {
    console.log('\nREMAINING COLLISIONS:');
    chk.forEach((r: any) => console.log(`  ${r.set_name} #${r.card_number} -> ${r.p}`));
  } else {
    console.log('\ncollision check clean - every number is unique within its set');
  }

  const fam = await sql`SELECT set_name, count(*)::int n FROM baseball_cards
    WHERE set_name LIKE '2026 Bowman%' GROUP BY 1 ORDER BY 1`;
  console.log('\n2026 Bowman family now:');
  fam.forEach((r: any) => console.log(`  ${r.n.toString().padStart(3)}  ${r.set_name}`));
  await sql.end();
})();
