/**
 * Book the 7-blister Destined Rivals lot sale, eBay order 24-15111-17625.
 *
 *   npx tsx scripts/book-dr-blister-lot7-sale-0903.ts [--apply]
 *
 * Sold TWO MINUTES after going live (published 03:53:20Z, order 03:55:59Z) to
 * the buyer it was built for. CORRECTED 2026-09-03: the order buyer is
 * brookh-82 and I first recorded that as a different person sniping the lot
 * ahead of zappescollection. It is zappescollection's second eBay account, as
 * Michael confirmed with him directly. See fix-blister-sale-buyer-note-0903.ts.
 * The fast sale is therefore pre-arrangement, not a price signal.
 *
 * Revenue is the ITEM subtotal, $84.00 for the lot, $12.00 a blister. Never
 * item + shipping, see [[feedback_ebay_shipping_wash]].
 *
 * Fees $13.57 for the order, and this is measured, not modelled: buyer paid
 * $84.00 + $7.60 shipping + $7.77 eBay-collected tax, seller due $78.03, so
 * ($84.00 + $7.60) - $78.03 = $13.57. That is exactly 13.25% of the $99.37
 * full total plus $0.40, which is the rule in [[reference_ebay_fee_rate]].
 * Allocated across 7 rows as 6 x $1.94 + 1 x $1.93.
 *
 * THE SHIPPING LABEL IS NOT BOUGHT YET and is deliberately excluded rather than
 * guessed, same as the Lorcana booking. Unlike that one it should be close to a
 * wash: the package was declared at a measured 15 oz and eBay collected $7.60.
 *
 * FIFO across both promos, all four lots at $7.17:
 *   Eevee  ci17246: pu554 x1, pu557 x3
 *   Zarude ci17247: pu553 x1, pu558 x2
 * Cost $50.19 the lot, so $84.00 - $13.57 - $50.19 = $20.24 realised.
 *
 * sale_date is 2026-09-03, his local date. The order stamps 2026-09-04T03:55Z
 * which is 20:55 Pacific on the 3rd.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ORDER = '24-15111-17625';
const DATE = '2026-09-03';
const PER_ITEM = 1200;   // $84.00 / 7
const PER_COST = 717;    // $7.17 a blister
const FEES = [194, 194, 194, 194, 194, 194, 193]; // sums to 1357
// [lot, catalogItemId, units] in FIFO order
const ROWS: [number, number, number][] = [
  [554, 17246, 1],
  [557, 17246, 3],
  [553, 17247, 1],
  [558, 17247, 2],
];
const NOTE = 'eBay order 24-15111-17625, 7-blister Destined Rivals checklane lot @ $84.00 the lot ($12.00 a ' +
  'blister), item subtotal $84.00, order total $91.60 incl $7.60 shipping plus $7.77 eBay-collected tax. ' +
  'Fees $13.57 measured from totalDueSeller $78.03, which is 13.25% of the $99.37 full total plus $0.40. ' +
  'SHIPPING LABEL NOT YET BOUGHT and not included; declared weight was a measured 15 oz against $7.60 ' +
  'collected, so it should be near a wash. Sold to brookh-82 two minutes after publish, NOT to ' +
  'zappescollection, who negotiated the $84 and never got the link in time.';

(async () => {
  const dupe: any = await sql`SELECT id FROM ebay_synced_orders WHERE ebay_order_id=${ORDER}`;
  if (dupe.length) { console.log(`order already in the sync ledger: row ${dupe[0].id}`); await sql.end(); return; }

  let units = 0;
  for (const [lot, ci, n] of ROWS) {
    const l: any = await sql`SELECT quantity, cost_cents, catalog_item_id FROM purchases WHERE id=${lot} AND deleted_at IS NULL`;
    if (!l.length) { console.error(`lot pu${lot} missing`); process.exit(1); }
    if (Number(l[0].catalog_item_id) !== ci) { console.error(`pu${lot} is ci${l[0].catalog_item_id}, expected ci${ci}`); process.exit(1); }
    if (Number(l[0].cost_cents) !== PER_COST) { console.error(`pu${lot} cost is ${l[0].cost_cents}, expected ${PER_COST}`); process.exit(1); }
    const sold: any = await sql`SELECT coalesce(sum(quantity),0) q FROM sales WHERE purchase_id=${lot}`;
    const avail = Number(l[0].quantity) - Number(sold[0].q);
    console.log(`pu${lot} ci${ci}: x${l[0].quantity} @ $${(l[0].cost_cents / 100).toFixed(2)}, ${avail} available, booking ${n}`);
    if (avail < n) { console.error(`not enough on pu${lot}`); process.exit(1); }
    units += n;
  }
  if (units !== 7 || FEES.length !== 7) { console.error(`expected 7 units, got ${units}`); process.exit(1); }
  const feeTotal = FEES.reduce((a, b) => a + b, 0);
  if (feeTotal !== 1357) { console.error(`fee allocation sums to ${feeTotal}, expected 1357`); process.exit(1); }

  const rev = units * PER_ITEM, cost = units * PER_COST;
  console.log(`\nrevenue $${(rev / 100).toFixed(2)}  fees $${(feeTotal / 100).toFixed(2)}  cost $${(cost / 100).toFixed(2)}` +
    `  -> realised $${((rev - feeTotal - cost) / 100).toFixed(2)} before the label (${(((rev - feeTotal - cost) / cost) * 100).toFixed(0)}% ROI)`);

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const uid: any = await sql`SELECT user_id FROM purchases WHERE id=554`;
  const group = randomUUID();
  let f = 0;
  for (const [lot, , n] of ROWS) {
    for (let i = 0; i < n; i++) {
      await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                                  fees_cents, matched_cost_cents, platform, notes, sale_group_id)
        VALUES (${uid[0].user_id}, ${lot}, ${DATE}, 1, ${PER_ITEM}, ${FEES[f]}, ${PER_COST}, 'eBay', ${NOTE}, ${group})`;
      f++;
    }
  }
  // Write the dedup ledger row so the app's own eBay sync cannot book this a
  // second time. Earlier manual bookings skipped this and left the ledger with
  // a false "NOT IN LEDGER" backlog.
  await sql`INSERT INTO ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped)
    VALUES (${uid[0].user_id}, ${ORDER}, ${group}, false)`;
  console.log(`\nbooked ${units} rows in group ${group}, ledger row written for ${ORDER}`);

  for (const ci of [17246, 17247]) {
    const h: any = await sql`
      SELECT coalesce(sum(pu.quantity),0) b,
        coalesce((SELECT sum(s.quantity) FROM sales s JOIN purchases p2 ON p2.id=s.purchase_id WHERE p2.catalog_item_id=${ci}),0) s
      FROM purchases pu WHERE pu.catalog_item_id=${ci} AND pu.deleted_at IS NULL`;
    console.log(`ci${ci}: bought ${h[0].b}, sold ${h[0].s}, on hand ${Number(h[0].b) - Number(h[0].s)}`);
  }
  await sql.end();
})();
