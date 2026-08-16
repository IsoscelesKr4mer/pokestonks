/**
 * Add the insert copies Michael counted in his physical team bags on
 * 2026-08-16 that had no row in the vault.
 *
 *   npx tsx scripts/add-bag-counted-inserts.ts           # dry run
 *   npx tsx scripts/add-bag-counted-inserts.ts --apply
 *
 * These are NOT missing photos of cards already logged. They are second copies
 * he never shot, because cheap inserts get sold through a quantity dropdown
 * rather than as individual listings, so a second photo was never worth taking:
 *
 *   "some of them i didnt take a second photo on the inserts because they are
 *    cheap enough and im selling w/ quantity on a dropdown"
 *
 * They therefore go in as `needs_photos` with an empty photo_urls array and no
 * price. That is the honest state: the card exists, it is his, and it cannot be
 * individually listed until it is shot.
 *
 * ASSUMPTION, FLAGGED IN EVERY ROW'S NOTES: the second copy carries the same
 * card_number as the copy already in the vault. Michael reported these as
 * "2 trouts in btp", "2 benge in future stars" and so on, i.e. two of the same
 * card, and these insert sets list a given player once. If a bag copy turns out
 * to be a different number, fix the row rather than adding another.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

/** card_number -> how many Michael counted in the bag, total. */
const COUNTED: { num: string; want: number }[] = [
  { num: 'WC-3', want: 2 },   // Kyle Schwarber
  { num: 'BTP-1', want: 2 },  // Mike Trout
  { num: 'BTP-6', want: 2 },  // Corbin Carroll
  { num: 'BTP-11', want: 2 }, // Juan Soto
  { num: 'BTP-12', want: 2 }, // Jackson Chourio
  { num: 'FS-10', want: 2 },  // Carson Benge
];

async function main() {
  const plan: any[] = [];
  for (const c of COUNTED) {
    const rows: any = await sql`
      SELECT id, player, set_name, card_number, parallel, status FROM baseball_cards
      WHERE card_number = ${c.num} AND set_name LIKE '2026 Topps Chrome (%insert)' AND status <> 'sold'`;
    if (!rows.length) { console.error(`${c.num}: nothing in the vault to copy from. Skipping, needs a photo first.`); continue; }
    const players = new Set(rows.map((r: any) => r.player));
    if (players.size > 1) { console.error(`${c.num}: maps to ${players.size} players (${[...players].join(' | ')}). Refusing to guess which to duplicate.`); continue; }
    const have = rows.length;
    const add = c.want - have;
    console.log(`${c.num.padEnd(8)} ${rows[0].player.padEnd(20)} vault ${have} -> bag ${c.want}  ${add > 0 ? `ADD ${add}` : 'nothing to add'}`);
    for (let i = 0; i < add; i++) plan.push({ ...rows[0], num: c.num, copyOf: rows[0].id });
  }

  console.log(`\n${plan.length} rows to add`);
  if (!APPLY || !plan.length) { console.log(APPLY ? '' : 'dry run'); await sql.end(); return; }

  for (const p of plan) {
    const notes = `Counted in the team bag 2026-08-16 but never photographed; Michael shoots one copy of the cheap inserts because they sell on a quantity dropdown. Second copy of #${p.copyOf}. NO PHOTO YET, and the card_number is assumed to match #${p.copyOf} - confirm both when it is shot.`;
    const [row] = await sql`
      INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                  status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES (${UID}, ${p.player}, ${p.set_name}, 2026, ${p.num}, ${p.parallel}, 'Baseball',
              'needs_photos', true, ${sql.json([])}, true, ${notes})
      RETURNING id`;
    console.log(`  #${row.id} ${p.num} ${p.player}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
