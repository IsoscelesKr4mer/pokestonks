/**
 * Resolve the two card-number collisions found by the post-ingest check on
 * 2026-08-20. A number cannot be held by two players inside one set.
 *
 *   npx tsx scripts/fix-card-misreads-0820.ts            # dry run
 *   npx tsx scripts/fix-card-misreads-0820.ts --apply
 *
 * Each write asserts the current value first, so a stale fix cannot clobber a
 * corrected row.
 *
 * 2026 TOPPS CHROME #7  ->  Basallo keeps 7, OHTANI MOVES TO 1.
 *   Both Basallo backs (bbcard_drop_0629, _1351) print 7 plainly.
 *   The Ohtani back (bbcard_59_shohei-ohtani_2) prints 1: cropped, rotated
 *   upright and upscaled 6x, it is an unmistakable 1 above CHROME, with the
 *   flag serif and no crossbar. This is the THIRD time an Ohtani has been
 *   logged as 7 when it is 1 (the card-intake skill already records two).
 *   The live eBay title carried the wrong number and is fixed separately.
 *
 * 2026 TOPPS FINEST #9  ->  Crawford keeps 9, MURAKAMI MOVES TO 8 (FLAGGED).
 *   Crawford's back (bbcard_drop_0575) is an unmistakable 9: round bowl, dot
 *   counter, tail descending left. Murakami's (bbcard_08_munetaka-murakami_2)
 *   is a visibly different glyph, so he is certainly not 9. At 14x with
 *   autocontrast it reads as an 8, two counters split by a diagonal bar, but
 *   Finest's stylised numerals are not safe to call from a blurry crop and a
 *   checklist lookup did not confirm it. So the number is set to 8 AND the row
 *   is flagged `confirm card number` for a physical check. Leaving it at 9 was
 *   not an option: that value is known wrong and keeps a false collision alive.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Fix = { id: number; player: string; set: string; from: string; to: string; note?: string };
const FIXES: Fix[] = [
  { id: 60, player: 'Shohei Ohtani', set: '2026 Topps Chrome', from: '7', to: '1',
    note: 'Red White & Blue Refractor. CARD NUMBER CORRECTED 2026-08-20 from 7 to 1: the back prints 1 above CHROME, confirmed at 6x upright. It collided with Samuel Basallo, who genuinely is #7 on two separate cards. Third recorded instance of an Ohtani logged as 7 when it is 1.' },
  { id: 9, player: 'Munetaka Murakami', set: '2026 Topps Finest', from: '9', to: '8',
    note: 'base (COMMON tier); RC. CARD NUMBER CORRECTED 2026-08-20 from 9 to 8. It collided with Justin Crawford, whose back is an unmistakable 9; this glyph is visibly different so it is certainly not 9. Read as 8 at 14x but Finest numerals are stylised and a checklist lookup did not confirm. **confirm card number** against the physical card.' },
];

async function main() {
  for (const f of FIXES) {
    const [row]: any = await sql`SELECT id, player, set_name, card_number FROM baseball_cards WHERE id = ${f.id}`;
    if (!row) { console.error(`row #${f.id} not found`); process.exit(1); }
    if (row.player !== f.player || row.set_name !== f.set) {
      console.error(`row #${f.id} is ${row.player} / ${row.set_name}, expected ${f.player} / ${f.set}`); process.exit(1);
    }
    if (row.card_number !== f.from) {
      console.error(`row #${f.id} card_number is "${row.card_number}", expected "${f.from}" - already fixed or changed, aborting`); process.exit(1);
    }
    console.log(`  #${f.id} ${f.player} (${f.set}): ${f.from} -> ${f.to}`);
    if (APPLY) await sql`UPDATE baseball_cards SET card_number = ${f.to}, notes = ${f.note ?? null}, updated_at = NOW() WHERE id = ${f.id}`;
  }
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }

  const col: any = await sql`
    SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') players
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1,2 HAVING count(DISTINCT player) > 1`;
  console.log('collisions remaining:', col.length ? col : 'none');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
