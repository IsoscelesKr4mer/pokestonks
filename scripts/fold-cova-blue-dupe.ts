/**
 * Undo the extra Cova Blue Sapphire row and fold it into the existing one.
 *
 *   npx tsx scripts/fold-cova-blue-dupe.ts           # dry run
 *   npx tsx scripts/fold-cova-blue-dupe.ts --apply
 *
 * I created #386 for a "second" Blue Sapphire because tonight's group shots
 * showed four signed Cova BCP-94s while the vault held three. Michael:
 *
 *   "I have like 6 or 7 of them i just didnt add dupes to the pc on the site.
 *    I have dupes of a lot of my pc"
 *
 * So the vault deliberately carries ONE row per PC card, not one per copy. The
 * missing fourth card was never a data gap, it was the convention. #386 is
 * noise and comes out; tonight's photos and the fact that more copies were
 * signed move onto the existing Blue row (#47), which keeps one row per card
 * and loses no evidence.
 *
 * Same shape as the insert lesson: a vault count is a FLOOR, not the truth.
 * Check the convention before "fixing" a gap.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const DUPE = 386;     // the row I should not have created
const KEEPER = 47;    // Ricardo Cova BCP-94 Blue Sapphire, already IP-signed 2026-07-26

async function main() {
  const rows: any = (await sql`
    SELECT id, player, set_name, card_number, parallel, status, for_sale, photo_urls,
           COALESCE(notes,'') AS notes, ebay_item_id
    FROM baseball_cards WHERE id = ANY(${[DUPE, KEEPER]})`).map((r: any) => ({ ...r, id: Number(r.id) }));
  const dupe = rows.find((r: any) => r.id === DUPE);
  const keep = rows.find((r: any) => r.id === KEEPER);
  if (!keep) { console.error(`#${KEEPER} missing`); process.exit(1); }
  if (!dupe) { console.log(`#${DUPE} already gone, nothing to do`); await sql.end(); return; }

  // never delete something that has been sold or listed
  const sold: any = await sql`SELECT status, ebay_item_id, sold_price_cents FROM baseball_cards WHERE id=${DUPE}`;
  if (sold[0].status === 'sold' || sold[0].ebay_item_id || sold[0].sold_price_cents) {
    console.error(`#${DUPE} is listed or sold, refusing to delete`); process.exit(1);
  }

  const merged = [...new Set([...(keep.photo_urls ?? []), ...(dupe.photo_urls ?? [])])];
  console.log(`fold #${DUPE} into #${KEEPER}`);
  console.log(`  #${KEEPER} photos ${(keep.photo_urls ?? []).length} -> ${merged.length}`);
  console.log(`  #${DUPE} deleted`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  await sql`UPDATE baseball_cards SET
      photo_urls = ${sql.json(merged)},
      notes = ${keep.notes + ' MULTIPLE COPIES HELD: Michael has roughly 6-7 of this Blue Sapphire and deliberately does not log PC duplicates, so this one row stands for all of them. Another copy was signed in person at the Everett AquaSox game 2026-08-16; the group shots from that night are attached here.'},
      updated_at = now() WHERE id = ${KEEPER}`;
  await sql`DELETE FROM baseball_cards WHERE id = ${DUPE}`;

  const after: any = await sql`SELECT id, player, parallel, jsonb_array_length(photo_urls) pics FROM baseball_cards WHERE id = ANY(${[DUPE, KEEPER]})`;
  for (const c of after) console.log(`  #${c.id} ${c.player} [${c.parallel}] ${c.pics} photos`);
  if (after.some((c: any) => Number(c.id) === DUPE)) { console.error('  dupe still present'); process.exit(1); }
  console.log(`  verified: #${DUPE} gone`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
