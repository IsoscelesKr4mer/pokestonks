/**
 * The Misiorowski #196 X-Fractor sale was booked against the wrong row.
 *
 * Michael holds TWO copies, rows #268 and #347, identical card and parallel.
 * One sold 2026-08-10 for $4.99 on the OLD Chrome you-pick, before the
 * 2026-08-18 rebuild that minted new item ids. I booked the sale against #268
 * because that is the SKU eBay reported (PYP-CHROME-268).
 *
 * But the CURRENT live listing carries PYP-CHROME-268 at $16.49 qty 1, and row
 * #347 has no live variation at all. Leaving it as booked would point a live
 * dropdown entry at a row marked sold, and leave the actually-available copy
 * invisible.
 *
 * The two rows are interchangeable, so which one carries the sale is pure
 * bookkeeping. Put the sale on the orphan (#347) and leave #268 listed to match
 * the live SKU. Physical count is unchanged: 2 owned, 1 sold, 1 available.
 *
 * The $4.99 is NOT a pricing error. That was the real price on the old listing
 * in August; $16.49 is a later reprice carried onto the rebuilt listing.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const [a]: any = await sql`SELECT id, player, card_number, parallel, status, sold_price_cents, notes FROM baseball_cards WHERE id=268`;
  const [b]: any = await sql`SELECT id, player, card_number, parallel, status, asking_price_cents FROM baseball_cards WHERE id=347`;
  if (a.status !== 'sold' || b.status !== 'listed') { console.error(`unexpected state: #268=${a.status} #347=${b.status}`); process.exit(1); }
  if (a.card_number !== b.card_number || a.parallel !== b.parallel) { console.error('rows are not the same card, aborting'); process.exit(1); }
  console.log(`  #268 ${a.player} ${a.card_number} [${a.parallel}] sold -> back to listed`);
  console.log(`  #347 ${b.player} ${b.card_number} [${b.parallel}] listed -> sold $4.99 2026-08-10`);
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }
  await sql`UPDATE baseball_cards SET status='listed', for_sale=true, sold_price_cents=NULL, sold_date=NULL,
    notes='Second of two identical #196 X-Fractors. The 2026-08-10 sale of this card number is booked on row #347, the copy with no live variation; this row stays listed because the live Chrome you-pick carries SKU PYP-CHROME-268 at $16.49.',
    updated_at=now() WHERE id=268`;
  await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=499, sold_date='2026-08-10',
    notes='Sold via eBay order 14-15004-74269 on 2026-08-10 (Pacific) for $4.99, on the OLD Chrome you-pick before the 2026-08-18 rebuild. eBay reported SKU PYP-CHROME-268, but that SKU is the one carried on the CURRENT live listing, so the sale is booked here on the interchangeable second copy to keep the live variation pointing at an available row. $4.99 was the real price at the time; $16.49 is a later reprice.',
    updated_at=now() WHERE id=347`;
  const c:any = await sql`SELECT id, status, asking_price_cents, sold_price_cents FROM baseball_cards WHERE id IN (268,347) ORDER BY id`;
  c.forEach((x:any)=>console.log(`  #${x.id} ${x.status} ask $${(x.asking_price_cents/100).toFixed(2)} sold ${x.sold_price_cents?'$'+(x.sold_price_cents/100).toFixed(2):'-'}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
