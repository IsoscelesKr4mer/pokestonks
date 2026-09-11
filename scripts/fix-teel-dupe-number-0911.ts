/**
 * Row 168 is the second copy of #19 Kyle Teel Mojo Refractor, not a card with
 * an unknown number. Its own note says so ("2nd copy, sells as qty 2 under
 * BBC-172"); the card_number just never got filled in, which is why the
 * you-pick dropdown shows a "? - Kyle Teel - Mojo Ref" row.
 *
 *   npx tsx scripts/fix-teel-dupe-number-0911.ts --apply
 *
 * Michael photographed the card on 2026-09-11: back reads 19, Chicago White
 * Sox, C. Asserts the row is still the one described before writing.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const [row] = await sql`select id, card_number, player, parallel, notes from baseball_cards where id = 168`;
  if (!row) throw new Error('row 168 is gone');
  if (row.player !== 'Kyle Teel' || row.parallel !== 'Mojo Refractor') throw new Error('row 168 is not the Teel Mojo: ' + JSON.stringify(row));
  if (row.card_number !== null) { console.log('already numbered: ' + row.card_number); await sql.end(); return; }
  console.log('168  ' + row.player + '  ' + row.parallel + '  card_number null -> 19');
  if (!APPLY) { console.log('DRY RUN, pass --apply'); await sql.end(); return; }
  await sql`update baseball_cards set card_number = '19', updated_at = now() where id = 168 and card_number is null`;
  const [after] = await sql`select card_number from baseball_cards where id = 168`;
  console.log('now: ' + after.card_number);
  await sql.end();
})();
