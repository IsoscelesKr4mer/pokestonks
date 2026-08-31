/**
 * 2026 Topps Finest Tatsuya Imai is #3, not #13.
 *
 *   npx tsx scripts/fix-imai-cardnum-0820.ts --apply
 *
 * Third misread of a stylised Finest numeral in one night, after Murakami
 * (logged 9, read as 8, actually 5). Finest prints its card number as a single
 * heavily stylised glyph above the tier word, and it is not reliably legible in
 * a photo: this one reads as a "B"-ish shape that was taken for 13.
 *
 * The checklist settles it: #3 is Tatsuya Imai, Houston Astros RC. The back
 * matches exactly, HOUSTON ASTROS - P, COMMON tier, Japanese league record.
 *
 * Suspicion was raised by the pricer, not by a human: 0 comps on a notable
 * rookie is a smell, and the wrong number was why nobody was selling "#13".
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const [row]: any = await sql`SELECT id, player, set_name, card_number FROM baseball_cards WHERE id = 121`;
  if (!row || row.player !== 'Tatsuya Imai' || row.set_name !== '2026 Topps Finest') {
    console.error('row #121 is not the Finest Imai, aborting'); process.exit(1);
  }
  if (row.card_number !== '13') {
    console.error(`row #121 card_number is "${row.card_number}", expected "13" - already fixed, aborting`); process.exit(1);
  }
  console.log('  #121 Tatsuya Imai (2026 Topps Finest): 13 -> 3');
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }
  const note = 'Astros RC. CARD NUMBER CORRECTED 2026-08-19 from 13 to 3. The 2026 Topps Finest checklist has #3 as Tatsuya Imai, Houston Astros RC, and the back matches exactly (HOUSTON ASTROS - P, COMMON tier). Finest stylised numerals are not reliably legible in a photo; this is the second Finest misread found the same night, after Munetaka Murakami. The wrong number is also why the pricer returned 0 comps.';
  await sql`UPDATE baseball_cards SET card_number='3', notes=${note}, updated_at=now() WHERE id=121`;
  const col:any = await sql`
    SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') players FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN' GROUP BY 1,2 HAVING count(DISTINCT player) > 1`;
  console.log('collisions:', col.length ? col : 'none');
  await sql.end();
}
main().catch((e)=>{console.error(String(e).slice(0,400));process.exit(1);});
