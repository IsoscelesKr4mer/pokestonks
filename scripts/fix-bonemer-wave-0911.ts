/**
 * Bonemer BCP-218 is a Purple WAVE, not a Purple Shimmer. Michael called it;
 * confirmed against live eBay photos of both parallels.
 *
 * Wave and Shimmer are both 1:37 for purple prospects, so the odds sheet cannot
 * separate them. The textures can: pulled reference photos of known Purple Wave
 * and known Purple Shimmer listings and the difference is unambiguous.
 *   Wave    dense VERTICAL ribbing, like corduroy
 *   Shimmer DIAGONAL streaks
 * Bonemer is vertical. The Arquette orange is diagonal, so that one stays a
 * Shimmer, and this is now verified rather than asserted.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const NOTE = 'Purple Wave /250, BCP-218. Texture matched against live eBay photos of known '
  + 'Purple Wave and Purple Shimmer cards: wave is vertical ribbing, shimmer is diagonal '
  + 'streaks. Comps 2026-09-11: the one listing that names Purple Wave asks $8.99; his '
  + 'whole purple /250 pool is $8.99 to $40 across 5 asks, median $13.';
(async () => {
  const rows = await sql`SELECT id, parallel, asking_price_cents c FROM baseball_cards
    WHERE year=2026 AND player='Caleb Bonemer' AND card_number='BCP-218'`;
  if (rows.length !== 1) { console.log('expected 1 row, got ' + rows.length); await sql.end(); return; }
  console.log('id ' + rows[0].id);
  console.log('   ' + rows[0].parallel + '  $' + (rows[0].c / 100).toFixed(2));
  console.log('-> Purple Wave Refractor /250 (066/250)  $13.00');
  if (APPLY) {
    await sql`UPDATE baseball_cards SET parallel='Purple Wave Refractor /250 (066/250)',
      asking_price_cents=1300, comp_note=${NOTE}, updated_at=now() WHERE id=${rows[0].id}`;
    console.log('updated');
  } else console.log('DRY RUN, pass --apply');
  await sql.end();
})();
