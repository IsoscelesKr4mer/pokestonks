/**
 * Book the 30th Celebration ETB sale.
 *
 *   npx tsx scripts/book-30th-etb-sale-0918.ts
 *
 * eBay order 23-15157-93829, 2026-09-18. Listed at 03:15 and paid at 03:58,
 * 43 minutes, at full ask with no offer.
 *
 *   subtotal   $159.99
 *   shipping   $  8.17  (buyer paid)
 *   total      $168.16
 *   eBay fee   $ 22.68
 *   to seller  $145.48
 *
 * Booked as revenue $159.99 with fees $22.68, matching every prior eBay sale in
 * this table: revenue is the ITEM SUBTOTAL only and the fee is the whole
 * marketplace fee, even though the fee is charged on the full order including
 * shipping and tax. Shipping is a wash against the label so it stays out of
 * revenue.
 *
 * Also writes the ebay_synced_orders dedup row. The app's own sync is dead while
 * Supabase is quota-restricted, and when it comes back it would re-import this
 * order and double-book it. `skipped` is false because the sale really was
 * created, just by hand rather than by the sync.
 *
 * NOT BOOKED HERE: the 8-card Pikachu lot, order 26-15152-32324, $17.00 accepted
 * off a Best Offer, $15.27 to seller. Those cards came out of the Tech Sticker
 * rips, whose basis was written off with the boxes, so there is no purchase row
 * to hang a sale on and `sales.purchase_id` is NOT NULL. Inventing a purchase
 * would fabricate a cost basis that does not exist. Same treatment the Naruto
 * singles got. Its dedup row IS written, so the sync cannot invent one later.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const PURCHASE = 621;          // 30th Celebration ETB, $55.00, Zulu's Board Games
const ORDER = '23-15157-93829';
const LOT_ORDER = '26-15152-32324';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${PURCHASE} and p.deleted_at is null`;
  if (!p) throw new Error('purchase ' + PURCHASE + ' missing');
  if (p.cost_cents !== 5500) throw new Error('cost moved, expected 5500, got ' + p.cost_cents);
  if (!/30th Celebration Elite Trainer Box/.test(p.name)) throw new Error('wrong item: ' + p.name);

  const [dupe] = await sql`select count(*)::int n from sales where purchase_id = ${PURCHASE}`;
  if (dupe.n) {
    console.log('  sale already booked for pu#' + PURCHASE + ', skipping');
  } else {
    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${USER}, ${PURCHASE}, '2026-09-18', 1, 15999, 2268, 5500, 'eBay',
        ${'eBay order ' + ORDER + ', item 168696938215. Sold at full ask 43 minutes ' +
          'after listing, no offer. Buyer in Saskatoon SK via eBay International ' +
          'Shipping, so the label is domestic to the Glendale Heights IL hub and ' +
          'eBay carries the international leg. Order total $168.16 including $8.17 ' +
          'buyer-paid shipping; eBay fee $22.68; $145.48 due to seller.'})
      returning id`;
    console.log('  booked sale #' + s.id + '  $159.99 rev, $22.68 fees, $55.00 cost  -> $90.48 profit on $145.48 net');
  }

  for (const [order, note] of [[ORDER, 'booked by hand'], [LOT_ORDER, 'no basis to book against']] as [string, string][]) {
    const [seen] = await sql`select count(*)::int n from ebay_synced_orders where ebay_order_id = ${order}`;
    if (seen.n) { console.log('  dedup row already present for ' + order); continue; }
    await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
      values (${USER}, ${order}, ${order === LOT_ORDER}, now())`;
    console.log('  dedup row for ' + order + '  (' + note + ')');
  }

  await sql.end();
})();
