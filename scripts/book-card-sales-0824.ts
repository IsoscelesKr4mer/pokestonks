/**
 * Book the card sales that were never marked sold. Michael: "I have a number of
 * unlogged sales i tihnk you should catch up on."
 *
 *   npx tsx scripts/book-card-sales-0824.ts            # dry run
 *   npx tsx scripts/book-card-sales-0824.ts --apply
 *
 * Card sales live on the baseball_cards row (status/sold_price/sold_date), NOT
 * in ebay_synced_orders, which only covers the sealed vault.
 *
 * Dates are the order creation time in PACIFIC, not the UTC date eBay returns.
 * Order 21-15047-83095 is 2026-08-23 03:05 UTC = 2026-08-22 20:05 Pacific, and
 * 23-15048-17235 is 2026-08-24 00:22 UTC = 2026-08-23 17:22 Pacific. Both would
 * be booked a day late off the raw UTC date.
 *
 * Row #268 deserves a note: there were TWO identical #196 X-Fractors. The
 * 2026-08-10 sale at $4.99 is already booked on row #347; this is the second
 * copy selling on 2026-08-23 at the corrected $16.49 ask. Not a double-book.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Sale = { id: number; order: string; date: string; price: number; item: string; extra?: string };
const SALES: Sale[] = [
  { id: 4,   order: '21-15047-83095', date: '2026-08-22', price: 900,  item: '168561671920', extra: 'Accepted Best Offer against a $10.49 ask.' },
  { id: 268, order: '23-15048-17235', date: '2026-08-23', price: 1649, item: '168622320644', extra: 'Second of the two identical #196 X-Fractors; the first sold 2026-08-10 on row #347.' },
  { id: 348, order: '23-15048-17235', date: '2026-08-23', price: 1549, item: '168622320644' },
  { id: 424, order: '23-15048-17235', date: '2026-08-23', price: 199,  item: '168622320644' },
  { id: 326, order: '23-15048-17235', date: '2026-08-23', price: 199,  item: '168622320644' },
  { id: 287, order: '23-15048-17235', date: '2026-08-23', price: 399,  item: '168622320644' },
];

async function main() {
  let n = 0, gross = 0;
  for (const s of SALES) {
    const [row]: any = await sql`SELECT id, player, card_number, parallel, status, asking_price_cents, notes FROM baseball_cards WHERE id=${s.id}`;
    if (!row) { console.error(`row #${s.id} not found`); process.exit(1); }
    if (row.status === 'sold') { console.log(`  #${s.id} ${row.player} already sold, skipping`); continue; }
    const delta = s.price - (row.asking_price_cents ?? 0);
    const flag = delta !== 0 ? `  (sold $${(s.price/100).toFixed(2)} vs ask $${((row.asking_price_cents??0)/100).toFixed(2)})` : '';
    console.log(`  #${String(s.id).padEnd(4)} ${row.player.padEnd(22)} ${(row.card_number??'').padEnd(6)} ${(row.parallel??'base').padEnd(20)} -> sold $${(s.price/100).toFixed(2)} on ${s.date}${flag}`);
    gross += s.price;
    if (!APPLY) continue;
    const note = [row.notes, `Sold via eBay order ${s.order} on ${s.date} (Pacific) for $${(s.price/100).toFixed(2)}, listing ${s.item}. ${s.extra ?? ''} Booked 2026-08-24 in the unlogged-sales catch-up.`.trim()].filter(Boolean).join(' ');
    await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${s.price}, sold_date=${s.date}, notes=${note}, updated_at=now() WHERE id=${s.id}`;
    n++;
  }
  console.log(`\n${APPLY ? n + ' booked' : 'dry run'}, $${(gross/100).toFixed(2)} gross`);
  if (APPLY) {
    const tot: any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
    console.log(`baseball_cards now: ${tot[0].c} sold, $${(tot[0].s/100).toFixed(2)} gross lifetime`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
