/**
 * Book the two card orders that were sold on eBay but never recorded.
 *
 *   npx tsx scripts/book-card-sales-0901.ts [--apply]
 *
 * Prices are the eBay ITEM SUBTOTAL divided by quantity, never the order total:
 * the order total carries shipping and tax, which are not revenue.
 *   09-01  order 12-15105-47232  Sal Stewart Base RC x3  $8.97  = $2.99 each
 *   08-31  order 16-15093-34572  PCA #45 base x2        $28.98 = $14.49 each
 *
 * The Destined Rivals $94.15 order from 09-01 is NOT here: it is the auction
 * already booked as sale#472 on 08-30 before payment cleared. Identical amount
 * and quantity, two days apart, and double-booking it would have invented a
 * second $94 sale.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ORDERS = [
  { order: '12-15105-47232', date: '2026-09-01', player: 'Sal Stewart', num: '6',
    item: '168654621768', qty: 3, each: 299, note: 'Sold as 3 of the same variation in one order.' },
  { order: '16-15093-34572', date: '2026-08-31', player: 'Pete Crow-Armstrong', num: '45',
    item: '168584893860', qty: 2, each: 1449, note: 'The last two of the three PCA #45 base cards. MVP buyback was worth $20 each against $14.49; he chose to let them sell.' },
];

(async () => {
  for (const o of ORDERS) {
    const rows: any = await sql`
      SELECT id, parallel, status, sold_price_cents FROM baseball_cards
      WHERE player=${o.player} AND card_number=${o.num} AND ebay_item_id=${o.item}
        AND coalesce(sold_price_cents,0)=0 ORDER BY id`;
    console.log(`\n${o.date} ${o.player} #${o.num} x${o.qty} @ $${(o.each/100).toFixed(2)}  (order ${o.order})`);
    console.log(`  unsold rows available: ${rows.length}`);
    if (rows.length < o.qty) { console.error(`  NOT ENOUGH UNSOLD ROWS, expected ${o.qty}. Skipping rather than guessing.`); continue; }
    const take = rows.slice(0, o.qty);
    for (const r of take) console.log(`    id${r.id} ${r.parallel}`);
    if (!APPLY) continue;
    for (const r of take) {
      await sql`UPDATE baseball_cards
        SET sold_price_cents=${o.each}, sold_date=${o.date}, status='sold', for_sale=false,
            notes = coalesce(notes,'') || ' SOLD on eBay order ' || ${o.order} || ' (' || ${o.date} || '). ' || ${o.note}
        WHERE id=${r.id}`;
    }
    console.log(`  booked ${take.length}`);
  }
  const left: any = await sql`SELECT count(*) c FROM baseball_cards WHERE coalesce(sold_price_cents,0)>0`;
  console.log(`\nbaseball_cards marked sold: ${left[0].c}`);
  if (!APPLY) console.log('dry run');
  await sql.end();
})();
