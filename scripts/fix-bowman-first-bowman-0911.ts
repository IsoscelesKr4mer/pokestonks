/**
 * Correct the 1st Bowman flag on the 2026-09-10 hobby rip.
 *
 *   npx tsx scripts/fix-bowman-first-bowman-0911.ts          # dry run
 *   npx tsx scripts/fix-bowman-first-bowman-0911.ts --apply
 *
 * THE MISTAKE: the ingest inferred "1st Bowman" from the BCP-/CPA- prefix.
 * That is wrong. The BCP subset contains both a player's first Bowman card AND
 * repeat prospects; only the first one carries the 1ST BOWMAN logo on the
 * front. Michael caught it on Jesus Made, who already had Bowman cards, so his
 * BCP-244 has no logo.
 *
 * Re-read off the card fronts: 17 of the 24 prospects carry the logo, 7 do not.
 * The seven are BCP-174 Arquette, BCP-218 Bonemer, BCP-244 Made, BCP-211
 * Caceres, BCP-224 Kilby, BCP-215 Fien and BCP-248 Pratt.
 *
 * This matters beyond tidiness: "1st Bowman" was in the TITLE of the $145
 * Arquette and the $18 Bonemer, which would have been a false claim in a live
 * listing. Nothing had been published, so nothing reached a buyer.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const flags: Record<string, any> = JSON.parse(readFileSync('scripts/_bow_firstbowman.json', 'utf8'));

(async () => {
  const rows: any[] = await sql`SELECT id, player, card_number, notes FROM baseball_cards
    WHERE notes LIKE '%2026-09-10%' ORDER BY id`;
  let fixAdd = 0, fixDrop = 0, ok = 0;
  for (const r of rows) {
    const flag = flags[r.card_number];
    if (flag === undefined) continue;              // not a prospect
    const has = /(^|\| )1st Bowman( \||$)/.test(r.notes);
    if (has === flag) { ok++; continue; }
    let notes: string;
    if (flag) { notes = '1st Bowman | ' + r.notes; fixAdd++; }
    else {
      notes = r.notes.replace(/^1st Bowman \| /, '')
        + ' | NOT a 1st Bowman: no 1ST BOWMAN logo on the front, checked 2026-09-11';
      fixDrop++;
    }
    console.log((flag ? 'ADD  ' : 'DROP ') + r.card_number.padEnd(9) + r.player);
    if (APPLY) await sql`UPDATE baseball_cards SET notes = ${notes}, updated_at = now() WHERE id = ${r.id}`;
  }
  console.log('\nalready correct ' + ok + ' | flag added ' + fixAdd + ' | flag removed ' + fixDrop);
  if (!APPLY) console.log('DRY RUN, pass --apply to write');
  await sql.end();
})();
