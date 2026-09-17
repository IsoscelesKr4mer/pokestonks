/**
 * Row 192 was filed as 2026 Bowman Chrome. It is not.
 *
 * BCP-150 is in the 2026 BOWMAN checklist, the May flagship. The 2026 Bowman
 * Chrome prospect run is BCP-151 to BCP-250, so BCP-150 cannot come from it.
 * Dalis's Bowman Chrome card is BCP-188. Michael said this and both checklists
 * back him up.
 *
 * This is the same misfiling as the ~30 Mojo Refractors from July that carry
 * 2026 Bowman numbering under a 2026 Bowman Chrome set name. Those are left
 * alone here; this row is corrected because a listing depends on it being right.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const NOTE = ' | Set corrected 2026-09-11: this is the 2026 BOWMAN (May) product, not Bowman Chrome. '
  + 'BCP-150 appears in the May checklist; Bowman Chrome prospects run BCP-151 to BCP-250. '
  + 'Dalis got a second 1st Bowman, BCP-188, in September Bowman Chrome.';
(async () => {
  const r: any[] = await sql`SELECT id, set_name, card_number, parallel FROM baseball_cards WHERE id = 192`;
  console.log('before: ' + r[0].set_name + '  #' + r[0].card_number + '  [' + r[0].parallel + ']');
  console.log('after:  2026 Bowman  #' + r[0].card_number);
  if (!APPLY) { console.log('DRY RUN'); await sql.end(); return; }
  await sql`UPDATE baseball_cards SET set_name = '2026 Bowman', notes = notes || ${NOTE},
    updated_at = now() WHERE id = 192`;
  console.log('updated');
  await sql.end();
})();
