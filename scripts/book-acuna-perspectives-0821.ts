/**
 * Book the Ronald Acuna Jr. Perspectives P-6 sale.
 *
 *   npx tsx scripts/book-acuna-perspectives-0821.ts            # dry run
 *   npx tsx scripts/book-acuna-perspectives-0821.ts --apply
 *
 * eBay order 01-15081-84711, created 2026-08-22 01:24 UTC = 2026-08-21 18:24
 * PACIFIC, so it books to 08-21. Sold off the Perspectives you-pick
 * (168617438227) at $2.99, SKU PYP-P-372 -> baseball_cards row #372.
 *
 * Card sales live on the card row, not ebay_synced_orders (sealed vault only).
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ID = 372;
const ORDER = '01-15081-84711';
const DATE = '2026-08-21';
const PRICE = 299;
const ITEM = '168617438227';

async function main() {
  const [row]: any = await sql`
    SELECT id, player, card_number, set_name, status, asking_price_cents, notes
    FROM baseball_cards WHERE id=${ID}`;
  if (!row) { console.error(`row #${ID} not found`); process.exit(1); }
  console.log(`#${row.id} ${row.player} ${row.card_number} (${row.set_name})`);
  console.log(`  status ${row.status} | ask $${(row.asking_price_cents / 100).toFixed(2)} -> sold $${(PRICE / 100).toFixed(2)} on ${DATE}`);
  if (row.status === 'sold') { console.log('  already booked, nothing to do'); await sql.end(); return; }
  if (!/acuna/i.test(row.player)) { console.error(`  player mismatch, expected Acuna, got ${row.player}`); process.exit(1); }

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  const note = [row.notes, `Sold via eBay order ${ORDER} on ${DATE} (Pacific) for $${(PRICE / 100).toFixed(2)}, you-pick listing ${ITEM}. Booked 2026-08-21.`].filter(Boolean).join(' ');
  await sql`
    UPDATE baseball_cards
    SET status='sold', for_sale=false, sold_price_cents=${PRICE}, sold_date=${DATE}, notes=${note}, updated_at=now()
    WHERE id=${ID}`;
  const tot: any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
  console.log(`\nbooked. baseball_cards now: ${tot[0].c} sold, $${(tot[0].s / 100).toFixed(2)} gross lifetime`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
