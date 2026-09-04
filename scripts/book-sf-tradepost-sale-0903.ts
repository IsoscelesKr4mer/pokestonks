/**
 * Book the 6 Shrouded Fable booster bundles sold to TradePost, order 586B118E.
 *
 *   npx tsx scripts/book-sf-tradepost-sale-0903.ts [--apply]
 *
 * Read off his TradePost payout screen, nothing inferred:
 *   Order 586B118E, sold Sep 3 2026 2:27 PM
 *   Unit price $43.90 x 6 = $263.40 sale total
 *   Custom Label -$10.41  (UPS 1Z1493G20318816578)
 *   Payout $252.99
 *
 * THE LABEL IS A REAL COST HERE, unlike an eBay sale. On eBay the buyer pays
 * shipping and it washes against the label, so revenue is the item subtotal and
 * the label stays out ([[feedback_ebay_shipping_wash]]). On a buylist HE ships
 * to THEM and eats the $10.41, so it belongs in fees_cents.
 *
 * Cost basis pu531, 6 @ $35.37 = $212.22, bought 2026-08-05 at Target.
 * Realised $252.99 - $212.22 = $40.77, $6.80 a bundle, 19% on cost.
 *
 * $43.90 against a $55.11 TCGCSV market is 79.7%, right on the ~78-79% that
 * [[reference_bundle_exit_channels]] already has for TradePost, so the payout
 * is normal for the channel rather than a bad deal.
 *
 * Both eBay listings for these were still live and were ended the moment he
 * said he no longer had them: #168592071604 (lot of 2, $109.99) and
 * #168606265372 (single, $54.99), 0 sold on each.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LOT = 531, CI = 5283, QTY = 6;
const DATE = '2026-09-03';
const PER_ITEM = 4390;                                  // $43.90 a bundle
const PER_COST = 3537;                                  // $35.37 a bundle
const FEES = [174, 174, 174, 173, 173, 173];            // the $10.41 label, sums to 1041
const NOTE = 'TradePost order 586B118E, sold 2026-09-03 14:27, 6x Shrouded Fable Booster Bundle @ $43.90 ' +
  '= $263.40, less the $10.41 shipping label he paid (UPS 1Z1493G20318816578) = $252.99 payout. The label ' +
  'IS in fees here because on a buylist he ships to them and eats it, unlike an eBay sale where the buyer ' +
  'pays it and it washes. Cost $35.37 a bundle from Target 2026-08-05 (pu531), so $40.77 realised, $6.80 a ' +
  'bundle. $43.90 is 79.7% of the $55.11 TCGCSV market, in line with the ~78-79% TradePost normally pays. ' +
  'Both eBay listings for these bundles (#168592071604 and #168606265372) were still live a month after ' +
  'this sale and were ended as soon as he mentioned it, 0 sold on either.';

(async () => {
  const l: any = await sql`SELECT quantity, cost_cents, catalog_item_id FROM purchases WHERE id=${LOT} AND deleted_at IS NULL`;
  if (!l.length) { console.error(`lot pu${LOT} missing`); process.exit(1); }
  if (Number(l[0].catalog_item_id) !== CI) { console.error(`pu${LOT} is ci${l[0].catalog_item_id}, expected ci${CI}`); process.exit(1); }
  if (Number(l[0].cost_cents) !== PER_COST) { console.error(`pu${LOT} cost is ${l[0].cost_cents}, expected ${PER_COST}`); process.exit(1); }
  const sold: any = await sql`SELECT coalesce(sum(quantity),0) q FROM sales WHERE purchase_id=${LOT}`;
  const avail = Number(l[0].quantity) - Number(sold[0].q);
  console.log(`pu${LOT}: x${l[0].quantity} @ $${(l[0].cost_cents / 100).toFixed(2)}, ${avail} available, booking ${QTY}`);
  if (avail < QTY) { console.error('not enough on the lot'); process.exit(1); }

  const feeTotal = FEES.reduce((a, b) => a + b, 0);
  if (FEES.length !== QTY || feeTotal !== 1041) { console.error(`fee allocation is ${FEES.length} rows summing to ${feeTotal}`); process.exit(1); }
  const rev = QTY * PER_ITEM, cost = QTY * PER_COST;
  console.log(`\nrevenue $${(rev / 100).toFixed(2)}  label $${(feeTotal / 100).toFixed(2)}  cost $${(cost / 100).toFixed(2)}` +
    `  -> realised $${((rev - feeTotal - cost) / 100).toFixed(2)} ($${((rev - feeTotal - cost) / QTY / 100).toFixed(2)} a bundle, ${(((rev - feeTotal - cost) / cost) * 100).toFixed(0)}% on cost)`);
  console.log(`payout check: $${((rev - feeTotal) / 100).toFixed(2)} should equal the $252.99 on his screen`);

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const uid: any = await sql`SELECT user_id FROM purchases WHERE id=${LOT}`;
  const group = randomUUID();
  for (let i = 0; i < QTY; i++) {
    await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                                fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      VALUES (${uid[0].user_id}, ${LOT}, ${DATE}, 1, ${PER_ITEM}, ${FEES[i]}, ${PER_COST}, 'TradePost', ${NOTE}, ${group})`;
  }
  console.log(`\nbooked ${QTY} rows in group ${group}`);
  const h: any = await sql`
    SELECT coalesce(sum(pu.quantity),0) b,
      coalesce((SELECT sum(s.quantity) FROM sales s JOIN purchases p2 ON p2.id=s.purchase_id WHERE p2.catalog_item_id=${CI}),0) s
    FROM purchases pu WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL`;
  console.log(`SF bundles: bought ${h[0].b}, sold ${h[0].s}, on hand ${Number(h[0].b) - Number(h[0].s)}`);
  await sql.end();
})();
