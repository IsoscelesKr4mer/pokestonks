/**
 * Book the Destined Rivals art set that sold on 09-02 and never reached the vault.
 *
 *   npx tsx scripts/book-missing-dr-artset-0914.ts --apply
 *
 * Michael, counting the physical packs: "i have 4 sets of 9 so 36 not 40 there
 * are none loose." He means 9 of each of the four sleeve arts. The vault said
 * 40. He was right and the vault was wrong.
 *
 * eBay order 14-15105-96096, 2026-09-02, one unit of listing 168623627775,
 * which is 4 sleeved packs, one complete art set. FULFILLED and PAID, buyer
 * ceicii. The listing reads Quantity 10 QuantitySold 1, so eBay knew; the sale
 * simply never got booked here. That is exactly the 4 packs he is missing.
 *
 * Figures are the real ones off the order, not the 0.847 estimate:
 *   item subtotal   $46.99   -> revenue, shipping excluded, shipping is a wash
 *   delivery        $ 6.95   buyer paid
 *   marketplace fee $ 8.17   actual totalMarketplaceFee
 *   due to seller   $45.77
 * Matched cost is 4 x $7.74 from lot 578.
 *
 * Also writes the ebay_synced_orders dedup row so a later sync cannot book
 * this order a second time.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LOT = 578, QTY = 4;
const GROSS = 4699, FEES = 817;
const ORDER = '14-15105-96096';

(async () => {
  const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents, p.user_id,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions d where d.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used
    from purchases p where p.id = ${LOT}`;
  const COST = lot.cost_cents * QTY;
  const before = lot.quantity - Number(lot.used);
  console.log('lot ' + LOT + ': bought ' + lot.quantity + ', used ' + lot.used + ', held ' + before);
  console.log('booking ' + QTY + ' packs, $' + (GROSS/100).toFixed(2) + ' revenue, $' + (FEES/100).toFixed(2) +
    ' fees, $' + (COST/100).toFixed(2) + ' cost -> $' + ((GROSS-FEES-COST)/100).toFixed(2) + ' profit');
  console.log('held after: ' + (before - QTY) + '   (Michael counts 36)');

  const [dupe]: any = await sql`select id from ebay_synced_orders where ebay_order_id = ${ORDER}`;
  if (dupe) { console.log('\norder ' + ORDER + ' is already in ebay_synced_orders, stopping'); await sql.end(); return; }
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const group = randomUUID();
  const [ins]: any = await sql`insert into sales
      (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    values (${lot.user_id}, ${LOT}, '2026-09-02', ${QTY}, ${GROSS}, ${FEES}, ${COST}, 'eBay',
      ${'eBay order ' + ORDER + ', listing 168623627775, one unit = 4 sleeved packs = one complete 4-art set. ' +
        'Item $46.99, buyer paid $6.95 shipping, actual marketplace fee $8.17, due to seller $45.77. ' +
        'Revenue booked item-only because shipping is a wash. BACKFILLED 2026-09-14: the sale was never ' +
        'booked when it happened, which is why the vault read 40 packs while Michael counted 36. He caught it.'},
      ${group})
    returning id`;
  console.log('\nbooked sale ' + ins.id);
  await sql`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
    values (${lot.user_id}, ${ORDER}, ${group}, false, now())`;
  console.log('dedup row written for order ' + ORDER);

  const [after]: any = await sql`select p.quantity -
      (coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions d where d.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0)) held
    from purchases p where p.id=${LOT}`;
  console.log('held now: ' + after.held);
  if (Number(after.held) !== 36) throw new Error('expected 36, got ' + after.held);
  console.log('matches his physical count');
  await sql.end();
})();
