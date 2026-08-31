/**
 * Murakami is 2026 Topps Finest #5, not #8 and not #9.
 *
 *   npx tsx scripts/fix-murakami-cardnum-0820.ts --apply
 *
 * Chain of errors on this one row, worth keeping:
 *   originally 9 -> collided with Justin Crawford, who really is 9
 *   I read the back glyph at 14x as an 8 and set it to 8, but flagged
 *     `confirm card number` because Finest numerals are stylised
 *   the checklist says 8 is Jose Altuve and 5 is Munetaka Murakami
 *
 * Two independent checklists agree (cardsmithsbreaks and checklistinsider):
 *   5  Munetaka Murakami - Chicago White Sox RC
 *   8  Jose Altuve - Houston Astros
 *   9  Justin Crawford - Philadelphia Phillies RC
 * The card back reads CHICAGO WHITE SOX - 1B and carries the RC badge, which
 * matches #5 exactly. The stylised Finest 5 is what I misread as an 8.
 *
 * LESSON: do not resolve a card number by staring harder at a blurry glyph.
 * The checklist is cheap, authoritative and settles it in one fetch. Flagging
 * the row was right; the flag is what stopped a wrong number going unnoticed.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const [row]: any = await sql`SELECT id, player, set_name, card_number FROM baseball_cards WHERE id = 9`;
  if (!row || row.player !== 'Munetaka Murakami' || row.set_name !== '2026 Topps Finest') {
    console.error('row #9 is not the Finest Murakami, aborting'); process.exit(1);
  }
  if (row.card_number !== '8') {
    console.error(`row #9 card_number is "${row.card_number}", expected "8" - already fixed or changed, aborting`); process.exit(1);
  }
  console.log(`  #9 Munetaka Murakami (2026 Topps Finest): 8 -> 5`);
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }
  const note = 'base (COMMON tier); RC. CARD NUMBER: this row has been 9 -> 8 -> 5. It was logged 9, which collided with Justin Crawford who genuinely is 9. I then read the back glyph at 14x as an 8 and flagged it `confirm card number` because Finest numerals are stylised. The checklist settles it: #5 is Munetaka Murakami (Chicago White Sox RC), #8 is Jose Altuve, #9 is Justin Crawford. Two independent checklists agree, and the back reads CHICAGO WHITE SOX - 1B with the RC badge, matching #5. Verified 2026-08-20, no longer needs confirming.';
  await sql`UPDATE baseball_cards SET card_number = '5', notes = ${note}, updated_at = NOW() WHERE id = 9`;
  const col: any = await sql`
    SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') players
    FROM baseball_cards WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1,2 HAVING count(DISTINCT player) > 1`;
  console.log('collisions remaining:', col.length ? col : 'none');
  const flagged: any = await sql`SELECT COUNT(*)::int c FROM baseball_cards WHERE notes ILIKE '%confirm card number%'`;
  console.log('rows still flagged confirm card number:', flagged[0].c);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
