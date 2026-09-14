/**
 * Book the two remaining eBay sales that never reached the vault.
 *
 *   npx tsx scripts/book-unbooked-ebay-0914.ts --apply
 *
 * Fallout from the Destined Rivals miscount. Michael counted 36 sleeved packs
 * against a vault that said 40, which turned out to be an unbooked order.
 * Auditing every eBay order since 2026-06-01 against ebay_synced_orders found
 * two more, both PAID:
 *
 *   07-15159-17337  09-11  Lorcana Attack of the Vine, 4 sleeved packs
 *                          $37.99 item, $6.69 fee, 4 from lot 509 @ $6.62
 *   18-15151-09339  09-14  30th Celebration Knock Out Collection
 *                          $28.99 item, $5.63 fee, 1 from lot 471 @ $11.06
 *                          FULFILLMENT NOT STARTED, this one still needs shipping
 *
 * Revenue is item subtotal only, shipping is a wash. Fees are the real
 * totalMarketplaceFee off each order, not the 0.847 estimate.
 *
 * Also backfills the ebay_synced_orders row for 09-15112-25904, which IS
 * already booked as sale 472 but was entered by hand with the item id in the
 * note instead of the order id, so the dedup table never learned about it. A
 * future sync would have booked it twice.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const JOBS = [
  { order: '07-15159-17337', date: '2026-09-11', lot: 509, qty: 4, gross: 3799, fees: 669,
    what: 'Lorcana Attack of the Vine, 4 sleeved packs', extra: '' },
  { order: '18-15151-09339', date: '2026-09-14', lot: 471, qty: 1, gross: 2899, fees: 563,
    what: '30th Celebration Knock Out Collection', extra: ' Fulfillment NOT_STARTED at booking time, still needs shipping.' },
];

(async () => {
  for (const jb of JOBS) {
    const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents, p.user_id,
        coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
        + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
        + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used
      from purchases p where p.id = ${jb.lot}`;
    const open = lot.quantity - Number(lot.used);
    const cost = lot.cost_cents * jb.qty;
    console.log(jb.order + '  ' + jb.what);
    console.log('   lot ' + jb.lot + ' open ' + open + ', taking ' + jb.qty +
      '  $' + (jb.gross/100).toFixed(2) + ' - $' + (jb.fees/100).toFixed(2) + ' - $' + (cost/100).toFixed(2) +
      ' = $' + ((jb.gross-jb.fees-cost)/100).toFixed(2) + ' profit');
    if (open < jb.qty) throw new Error(jb.order + ': only ' + open + ' open on lot ' + jb.lot);
    const [dupe]: any = await sql`select id from ebay_synced_orders where ebay_order_id = ${jb.order}`;
    if (dupe) { console.log('   already in ebay_synced_orders, skipping'); continue; }
    if (!APPLY) continue;

    const group = randomUUID();
    const [ins]: any = await sql`insert into sales
        (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      values (${lot.user_id}, ${jb.lot}, ${jb.date}, ${jb.qty}, ${jb.gross}, ${jb.fees}, ${cost}, 'eBay',
        ${'eBay order ' + jb.order + '. Item subtotal $' + (jb.gross/100).toFixed(2) +
          ', actual marketplace fee $' + (jb.fees/100).toFixed(2) + '. Revenue is item-only, shipping is a wash. ' +
          'BACKFILLED 2026-09-14 by the unbooked-order audit that started from Michael counting his Destined ' +
          'Rivals packs by hand.' + jb.extra}, ${group})
      returning id`;
    await sql`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
      values (${lot.user_id}, ${jb.order}, ${group}, false, now())`;
    console.log('   booked sale ' + ins.id + ', dedup row written');
  }

  // already booked as sale 472, just never recorded in the dedup table
  const ORPHAN = '09-15112-25904';
  const [have]: any = await sql`select id from ebay_synced_orders where ebay_order_id = ${ORPHAN}`;
  if (have) console.log('\n' + ORPHAN + ' already has a dedup row');
  else {
    const [s]: any = await sql`select id, user_id, sale_group_id from sales where id = 472`;
    console.log('\n' + ORPHAN + ' is booked as sale ' + s.id + ' but missing its dedup row');
    if (APPLY) {
      await sql`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
        values (${s.user_id}, ${ORPHAN}, ${s.sale_group_id}, false, now())`;
      console.log('   dedup row written, pointing at sale 472');
    }
  }
  if (!APPLY) console.log('\nDRY RUN, pass --apply');
  await sql.end();
})();
