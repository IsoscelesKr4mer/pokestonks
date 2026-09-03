/**
 * Book the 4x Lorcana Illumineer's Trove sale, order 02-15133-80366.
 *
 * Revenue is the ITEM subtotal only, $79.99 a unit, never item + shipping.
 * Fees are 13.25% of the FULL order total ($329.65, item + shipping) plus $0.40
 * once for the order, so $44.08, allocated $11.02 a unit.
 *
 * THE SHIPPING LABEL IS NOT KNOWN YET and is deliberately excluded rather than
 * guessed. The listing declares 1 lb 3 oz and package type PackageThickEnvelope
 * for a product that is a boxed Trove, so the $9.69 eBay calculated is very
 * likely short of the real label on four of them. Update fees_cents once he
 * buys it.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const LOT = 507, CI = 135073, QTY = 4;
const PER_ITEM = 7999, PER_FEE = 1102, PER_COST = 5500;
const DATE = '2026-09-03';
const NOTE = 'eBay order 02-15133-80366, 4x Illumineer\'s Trove @ $79.99 (item subtotal $319.96, order total ' +
  '$329.65 incl $9.69 shipping). Fees 13.25% of the full order total plus $0.40 once = $44.08, $11.02 a unit. ' +
  'SHIPPING LABEL NOT YET BOUGHT and NOT included here: the listing declared 1 lb 3 oz and PackageThickEnvelope ' +
  'for a boxed Trove, so the $9.69 collected is likely short on four of them. Add the real label to fees when known.';
(async () => {
  const dupe: any = await sql`SELECT id FROM sales WHERE purchase_id=${LOT} AND sale_date=${DATE}`;
  if (dupe.length) { console.log(`already booked: sale#${dupe[0].id}`); await sql.end(); return; }
  const lot: any = await sql`SELECT quantity, cost_cents FROM purchases WHERE id=${LOT}`;
  console.log(`lot pu${LOT}: x${lot[0].quantity} @ $${(lot[0].cost_cents/100).toFixed(2)}`);
  const sold: any = await sql`SELECT coalesce(sum(quantity),0) q FROM sales WHERE purchase_id=${LOT}`;
  const avail = Number(lot[0].quantity) - Number(sold[0].q);
  console.log(`available on the lot: ${avail}, booking ${QTY}`);
  if (avail < QTY) { console.error('not enough on the lot'); process.exit(1); }
  console.log(`\nper unit: revenue $${(PER_ITEM/100).toFixed(2)}  fees $${(PER_FEE/100).toFixed(2)}  cost $${(PER_COST/100).toFixed(2)}` +
    `  -> $${((PER_ITEM-PER_FEE-PER_COST)/100).toFixed(2)} before the label`);
  console.log(`total: revenue $${(QTY*PER_ITEM/100).toFixed(2)}  fees $${(QTY*PER_FEE/100).toFixed(2)}  cost $${(QTY*PER_COST/100).toFixed(2)}` +
    `  -> $${(QTY*(PER_ITEM-PER_FEE-PER_COST)/100).toFixed(2)} before the label`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  const uid: any = await sql`SELECT user_id FROM purchases WHERE id=${LOT}`;
  const group = randomUUID();
  for (let i = 0; i < QTY; i++) {
    await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                                fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      VALUES (${uid[0].user_id}, ${LOT}, ${DATE}, 1, ${PER_ITEM}, ${PER_FEE}, ${PER_COST}, 'eBay', ${NOTE}, ${group})`;
  }
  const held: any = await sql`SELECT sum(pu.quantity) b,
      coalesce((SELECT sum(s.quantity) FROM sales s JOIN purchases p2 ON p2.id=s.purchase_id WHERE p2.catalog_item_id=${CI}),0) s
    FROM purchases pu WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL`;
  console.log(`\nbooked ${QTY} in group ${group}`);
  console.log(`Troves: bought ${held[0].b}, sold ${held[0].s}, on hand ${Number(held[0].b)-Number(held[0].s)}`);
  await sql.end();
})();
