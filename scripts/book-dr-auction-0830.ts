/**
 * Book the Destined Rivals art-set auction: item 168632581778, 12 sleeved packs
 * (3 complete 4-art sets), closed $94.15 on 16 bids.
 *
 * Ended 2026-08-31 01:00Z = 2026-08-30 18:00 Pacific, so the sale DATE is
 * 2026-08-30. Booking on the UTC date would put it in the wrong month.
 *
 * Booked before payment clears, deliberately. Leaving it unbooked is exactly
 * what made me tell Michael he still held 13 art sets an hour after he sold
 * three of them. If the buyer never pays, reverse it; a wrong number in the
 * vault is worse than a reversible one.
 *
 * Fees are 13.25% of the order plus $0.40, but the shipping portion is unknown
 * until the order lands, so this books the fee on the item subtotal only and
 * says so. It will read slightly low until the order syncs.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
const LOT=578, QTY=12, GROSS=9415, DATE='2026-08-30', ITEM='168632581778';
const FEES = Math.round(GROSS*0.1325) + 40;
(async()=>{
  const [lot]:any = await sql`SELECT id, quantity, cost_cents FROM purchases WHERE id=${LOT}`;
  const [sold]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM sales WHERE purchase_id=${LOT}`;
  const open = lot.quantity - sold.q;
  const cost = lot.cost_cents * QTY;
  console.log(`lot pu${LOT}: ${open} open at $${(lot.cost_cents/100).toFixed(2)} each`);
  console.log(`selling ${QTY} for $${(GROSS/100).toFixed(2)}, fees $${(FEES/100).toFixed(2)}, cost $${(cost/100).toFixed(2)}`);
  console.log(`realized: $${((GROSS-FEES-cost)/100).toFixed(2)}`);
  if (open < QTY) { console.error('not enough open units'); await sql.end(); return; }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  const note = `eBay auction ${ITEM} closed ${DATE} (Pacific; ended 2026-08-31 01:00Z) at $${(GROSS/100).toFixed(2)} on 16 bids from a $0.99 start. 12 sleeved packs = 3 complete 4-art sets. Booked before payment cleared; reverse if the buyer defaults. Fee is 13.25% of the ITEM subtotal + $0.40 only - the shipping share is not known until the order syncs, so this reads slightly low.`;
  await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
    VALUES (${UID}, ${LOT}, ${DATE}, ${QTY}, ${GROSS}, ${FEES}, ${cost}, 'eBay', ${note})`;
  const [after]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM sales WHERE purchase_id=${LOT}`;
  console.log(`\nbooked. DR sleeved packs held: ${lot.quantity - after.q}  =  ${(lot.quantity-after.q)/4} art sets`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
