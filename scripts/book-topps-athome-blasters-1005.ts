/**
 * Book the Topps "At Home" sale of 8 Bowman Basketball Blasters.
 *
 *   npx tsx scripts/book-topps-athome-blasters-1005.ts [--apply]
 *
 * Michael: "we sold the bowman blasters and they're still there."
 *
 * They are still there because the sale did not happen on eBay. It went through
 * Topps' own marketplace with At Home fulfilment, order TPST-GZAXJ0Y9, so no
 * eBay listing ended and nothing synced. This is exactly the failure mode in
 * feedback_offebay_exits_leave_listings_live: an off-eBay exit pulls stock out of
 * the house without the vault ever hearing about it.
 *
 * From his order screenshot:
 *   Sold        2026-09-30 22:34
 *   Order       TPST-GZAXJ0Y9
 *   Unit price  $42.09
 *   Quantity    8
 *   Sale total  $336.72
 *   Label       $16.30  (Home Depot X-Small Box, 8 units, 1Z1493G20305819036)
 *   Payout      $320.42
 *
 * REVENUE IS THE ITEM SUBTOTAL WITH THE LABEL OUT, matching how every eBay sale
 * in this table is booked (feedback_ebay_shipping_wash). So sale_price_cents is
 * the $336.72 and fees_cents is the $16.30 label, which reconciles exactly to the
 * $320.42 payout he was actually paid. No guessing.
 *
 * Cost basis comes from the real lot rather than a blended average
 * (feedback_cost_basis_actual_lots): purchase 629, 8 units at $33.15 each from
 * Fred Meyer Lynnwood on 2026-09-23, $265.19 on the receipt.
 *
 * One row with quantity 8 rather than eight rows: it is a single order against a
 * single lot, and the table already carries a quantity column.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const LOT = 629;
const QTY = 8;
const REVENUE = 33672;   // 8 x $42.09
const LABEL = 1630;      // deducted from payout
const PAYOUT = 32042;
const SALE_DATE = '2026-09-30';

(async () => {
  const p = await sql`SELECT pu.id, pu.quantity, pu.cost_cents, pu.purchase_date::text d, pu.source,
      ci.name, pu.deleted_at
    FROM purchases pu JOIN catalog_items ci ON ci.id = pu.catalog_item_id WHERE pu.id = ${LOT}`;
  if (!p.length) { console.log(`ABORT, purchase lot ${LOT} not found`); await sql.end(); return; }
  const lot = p[0] as any;
  console.log(`lot ${lot.id}: ${lot.name}`);
  console.log(`  ${lot.quantity} @ $${(lot.cost_cents / 100).toFixed(2)} from ${lot.source} on ${lot.d}`);
  if (lot.deleted_at) { console.log('ABORT, lot is soft-deleted'); await sql.end(); return; }

  const prior = await sql`SELECT id, quantity, sale_price_cents, sale_date::text d, platform
    FROM sales WHERE purchase_id = ${LOT}`;
  const alreadySold = (prior as any[]).reduce((a, x) => a + x.quantity, 0);
  console.log(`  already booked against this lot: ${alreadySold}`);
  prior.forEach((x: any) => console.log(`    sale ${x.id}: qty ${x.quantity} $${(x.sale_price_cents / 100).toFixed(2)} ${x.d} ${x.platform}`));

  const rips = await sql`SELECT count(*)::int n FROM rips WHERE source_purchase_id = ${LOT}`;
  console.log(`  rips off this lot: ${rips[0].n}`);

  const held = lot.quantity - alreadySold - rips[0].n;
  console.log(`  HELD RIGHT NOW: ${held}`);

  if (alreadySold >= QTY) { console.log('\nAlready booked, nothing to do.'); await sql.end(); return; }
  if (held < QTY) { console.log(`\nABORT: trying to sell ${QTY} but only ${held} on hand.`); await sql.end(); return; }

  const cost = lot.cost_cents * QTY;
  console.log(`\n  revenue   $${(REVENUE / 100).toFixed(2)}`);
  console.log(`  label     $${(LABEL / 100).toFixed(2)}`);
  console.log(`  payout    $${((REVENUE - LABEL) / 100).toFixed(2)}  (screenshot says $${(PAYOUT / 100).toFixed(2)})`);
  console.log(`  cost      $${(cost / 100).toFixed(2)}  (${QTY} x $${(lot.cost_cents / 100).toFixed(2)})`);
  console.log(`  PROFIT    $${((REVENUE - LABEL - cost) / 100).toFixed(2)}  (${(((REVENUE - LABEL - cost) / cost) * 100).toFixed(1)}% on cost)`);
  if (REVENUE - LABEL !== PAYOUT) { console.log('\nABORT: revenue minus label does not reconcile to the payout on the screenshot.'); await sql.end(); return; }

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const r = await sql`INSERT INTO sales
    (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents,
     matched_cost_cents, platform, notes, sale_group_id)
    VALUES (${UID}, ${LOT}, ${SALE_DATE}::date, ${QTY}, ${REVENUE}, ${LABEL},
            ${cost}, 'Topps At Home',
            ${'Topps marketplace order TPST-GZAXJ0Y9, At Home fulfilment, sold 2026-09-30 22:34. '
              + '8 units at $42.09 = $336.72, less a $16.30 Home Depot X-Small Box label for all 8 '
              + '(1Z1493G20305819036), payout $320.42. Revenue is the item subtotal with the label out, '
              + 'the same convention as the eBay rows. Booked 2026-10-05 after Michael noticed the blasters '
              + 'were still showing as held: the sale was off eBay so no listing ended and nothing synced. '
              + 'Cost basis is lot 629, 8 x $33.15 from Fred Meyer Lynnwood on 2026-09-23.'},
            ${randomUUID()})
    RETURNING id, quantity, sale_price_cents, fees_cents, matched_cost_cents`;
  const s = r[0] as any;
  console.log(`\nbooked sale ${s.id}: qty ${s.quantity}, revenue $${(s.sale_price_cents / 100).toFixed(2)}, fees $${(s.fees_cents / 100).toFixed(2)}, cost $${(s.matched_cost_cents / 100).toFixed(2)}`);

  const after = await sql`SELECT coalesce(sum(quantity),0)::int n FROM sales WHERE purchase_id = ${LOT}`;
  console.log(`held after: ${lot.quantity - after[0].n - rips[0].n}`);
  await sql.end();
})();
