/**
 * Corrections found while auditing the vault against Michael's team bags,
 * 2026-08-16. Each one was verified by re-reading the card's own photo, not
 * inferred.
 *
 *   npx tsx scripts/fix-card-misreads-0816.ts           # dry run
 *   npx tsx scripts/fix-card-misreads-0816.ts --apply
 *
 * How these were found: two different players held the same card_number inside
 * one set, which is impossible. That query is worth running after every ingest.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Fix = { id: number; field: 'card_number' | 'player'; from: string; to: string; why: string };

const FIXES: Fix[] = [
  {
    id: 321, field: 'card_number', from: 'WC-15', to: 'WC-25',
    why: 'Back of IMG_1464 reads WC-25. Ingested from the 08-13 rip as WC-15, which collided with Ketel Marte, who really is WC-15 (verified on IMG_0980). Michael spotted Marte missing from the Wrecking Crew list because of this.',
  },
  {
    id: 336, field: 'card_number', from: '7', to: '1',
    why: 'Back of IMG_1445 reads 1, not 7. Collided with Samuel Basallo, who really is #7 (verified on IMG_1351). Same 08-13 ingest.',
  },
  {
    id: 159, field: 'player', from: 'Matt Chapman / Will Clark', to: 'Will Clark / Matt Chapman',
    why: 'Past to Present prints the past player first; PTP-24 lists Will Clark on top and Matt Chapman below. Matching the other copy (#370) so the pair groups as one card.',
  },
];

async function main() {
  for (const f of FIXES) {
    const [row]: any = await sql`SELECT id, player, card_number, set_name FROM baseball_cards WHERE id = ${f.id}`;
    if (!row) { console.error(`#${f.id} not found`); process.exit(1); }
    const actual = f.field === 'player' ? row.player : row.card_number;
    if (actual !== f.from) {
      console.error(`#${f.id} ${f.field} is "${actual}", expected "${f.from}". Refusing to touch it.`);
      process.exit(1);
    }
    console.log(`#${f.id} ${row.set_name}`);
    console.log(`   ${f.field}: "${f.from}" -> "${f.to}"`);
    console.log(`   ${f.why}\n`);
  }
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }

  for (const f of FIXES) {
    const note = `CORRECTED 2026-08-16: ${f.field} ${f.from} -> ${f.to}. ${f.why}`;
    if (f.field === 'card_number') {
      await sql`UPDATE baseball_cards SET card_number = ${f.to},
        notes = trim(both ' ' from coalesce(notes,'') || ' ' || ${note}), updated_at = now() WHERE id = ${f.id}`;
    } else {
      await sql`UPDATE baseball_cards SET player = ${f.to},
        notes = trim(both ' ' from coalesce(notes,'') || ' ' || ${note}), updated_at = now() WHERE id = ${f.id}`;
    }
  }
  console.log(`${FIXES.length} rows corrected.`);

  const still: any = await sql`
    SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') players
    FROM baseball_cards WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1,2 HAVING count(DISTINCT player) > 1 ORDER BY 1,2`;
  console.log(still.length ? '\nSTILL COLLIDING (one player has a wrong number):' : '\nNo card_number collisions left.');
  for (const s of still) console.log(`  ${s.set_name} | ${s.card_number}: ${s.players}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
