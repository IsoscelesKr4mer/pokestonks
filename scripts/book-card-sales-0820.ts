/**
 * Book the eBay card sales that were never marked sold on their baseball_cards
 * rows. Card sales are recorded on the card row (status/sold_price/sold_date),
 * NOT through ebay_synced_orders, which only covers the sealed vault.
 *
 *   npx tsx scripts/book-card-sales-0820.ts            # dry run
 *   npx tsx scripts/book-card-sales-0820.ts --apply
 *
 * Michael said "sold a few baseball cards today". Pulling the orders showed
 * today's four, and eight unbooked in total going back to 2026-08-10. The
 * you-pick sales are easy to miss because the listing stays live and only the
 * variation quantity moves.
 *
 * Dates are the order creation time converted to PACIFIC, not the UTC date
 * eBay returns. Order 21-15040-18515 is 2026-08-21 04:19 UTC = 2026-08-20
 * 21:19 Pacific, which is the "today" Michael meant.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Sale = { id: number; order: string; date: string; price: number; item: string };
const SALES: Sale[] = [
  { id: 268, order: '14-15004-74269', date: '2026-08-10', price: 499,  item: '168622320644' },
  { id: 374, order: '23-15015-33186', date: '2026-08-16', price: 499,  item: '168617438107' },
  { id: 322, order: '16-15027-70619', date: '2026-08-16', price: 199,  item: '168617438107' },
  { id: 103, order: '26-15012-86733', date: '2026-08-16', price: 299,  item: '168622312679' },
  { id: 320, order: '03-15070-37714', date: '2026-08-20', price: 7500, item: '168612706328' },
  { id: 373, order: '21-15040-18515', date: '2026-08-20', price: 399,  item: '168617438227' },
  { id: 371, order: '21-15040-18515', date: '2026-08-20', price: 349,  item: '168617438227' },
  { id: 151, order: '21-15040-18515', date: '2026-08-20', price: 499,  item: '168617438227' },
];

async function main() {
  let n = 0;
  for (const s of SALES) {
    const [row]: any = await sql`SELECT id, player, card_number, status, asking_price_cents, sold_price_cents, notes FROM baseball_cards WHERE id=${s.id}`;
    if (!row) { console.error(`row #${s.id} not found`); process.exit(1); }
    if (row.status === 'sold') { console.log(`  #${s.id} ${row.player} already sold, skipping`); continue; }
    const delta = s.price - row.asking_price_cents;
    const flag = delta !== 0 ? `  (sold $${(s.price/100).toFixed(2)} vs ask $${(row.asking_price_cents/100).toFixed(2)})` : '';
    console.log(`  #${String(s.id).padEnd(4)} ${row.player.padEnd(22)} ${row.card_number.padEnd(8)} -> sold $${(s.price/100).toFixed(2)} on ${s.date}${flag}`);
    if (!APPLY) continue;
    const note = [row.notes, `Sold via eBay order ${s.order} on ${s.date} (Pacific) for $${(s.price/100).toFixed(2)}, you-pick listing ${s.item}. Booked 2026-08-20.`].filter(Boolean).join(' ');
    await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${s.price}, sold_date=${s.date}, notes=${note}, updated_at=now() WHERE id=${s.id}`;
    n++;
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  console.log(`\n${n} card sales booked`);
  const tot: any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
  console.log(`baseball_cards now: ${tot[0].c} sold, $${(tot[0].s/100).toFixed(2)} gross lifetime`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
