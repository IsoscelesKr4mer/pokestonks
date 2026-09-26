/**
 * Book the Destined Rivals 4-art sleeved set that sold 2026-09-26.
 *
 *   npx tsx scripts/book-dr-artpacks-0926.ts
 *
 * "sold some destined rivals art packs today"
 *
 * eBay order 23-15192-48760, item 168623627775, one unit = four sleeved packs
 * (the mapping already says qty 4, which is right: the listing IS the 4-art set,
 * so one sale moves four packs).
 *
 *   item     $46.99
 *   shipping   6.47   collected
 *   total    $53.46   -> the fee base
 *
 * Revenue is booked as the ITEM SUBTOTAL only, and the label stays out, per
 * [[feedback_ebay_shipping_wash]]. The FEE, though, is 13.25% of the FULL order
 * total plus the $0.40 per-order charge, so it is computed off $53.46 and not
 * off $46.99: 53.46 x 0.1325 = 7.08, + 0.40 = $7.48.
 *
 * FIFO lands on pu578 (52 packs at $7.74, Safeway 2026-08-18, 36 still open);
 * pu124 is a single pack already sold out.
 *
 * This also backfills ebay_synced_orders so the sync cannot book it twice.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '23-15192-48760';
const ITEM = '168623627775';
const DATE = '2026-09-26';
const QTY = 4;
const REVENUE = 4699;   // item subtotal, shipping excluded
const FEES = 748;       // 13.25% of the $53.46 order total + $0.40
const LOT = 578;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('Destined Rivals')) throw new Error('pu' + LOT + ' is ' + p.name);
  const open = p.quantity - p.sold;
  if (open < QTY) throw new Error('pu' + LOT + ' has ' + open + ' open, selling ' + QTY);

  const [dupe] = await sql`select count(*)::int n from sales
    where purchase_id = ${LOT} and sale_date = ${DATE} and sale_price_cents = ${REVENUE}`;
  if (dupe.n) { console.log('already booked'); await sql.end(); return; }

  const cost = p.cost_cents * QTY;
  const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
      sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
    values (${USER}, ${LOT}, ${DATE}, ${QTY}, ${REVENUE}, ${FEES}, ${cost}, 'eBay',
      ${'eBay order ' + ORDER + ', item ' + ITEM + '. The complete 4-art sleeved set. '
        + 'Item $46.99 plus $6.47 shipping = $53.46; revenue booked as the item subtotal '
        + 'with the label out, fee computed on the full order total.'})
    returning id`;
  console.log('sale#' + s.id + '  x' + QTY + ' packs  rev $' + (REVENUE / 100).toFixed(2)
    + '  fees $' + (FEES / 100).toFixed(2) + '  cost $' + (cost / 100).toFixed(2)
    + '  profit $' + ((REVENUE - FEES - cost) / 100).toFixed(2));
  console.log('  pu' + LOT + ' now ' + (open - QTY) + ' packs open');

  await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
    values (${USER}, ${ORDER}, false, now()) on conflict do nothing`;
  console.log('  ' + ORDER + ' marked synced, so the sync cannot double-book it');
  await sql.end();
})();
