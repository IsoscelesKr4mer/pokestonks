/**
 * Five 30th Celebration Elite Trainer Boxes, Fred Meyer Shoreline, 2026-10-28.
 *
 *   npx tsx scripts/log-30th-etb-fredmeyer-1028.ts
 *
 * Receipt photographed (IMG_2528), 18325 Aurora Ave North, 10/28/26 15:06,
 * and it reconciles exactly, so nothing here is estimated:
 *
 *   5 x TRADING CRD  69.99   349.95   (all one UPC, 19621415880)
 *   CHECKOUT BAG                0.08
 *   TAX                        36.74
 *   BALANCE                   386.77
 *
 * 349.95 x 0.105 = 36.7448, which rounds to the 36.74 printed, so the rate is
 * Shoreline's 10.50% and the 8 cent bag is not in the cost of the cards.
 *
 * Unit cost is $69.99 x 1.105 = $77.33895, logged as 7734 cents. Five at that
 * figure is $386.70 against the $386.69 the cards actually cost once the bag
 * is taken out: Kroger taxes the subtotal once and rounds once, and a
 * per-unit column cannot hold a tenth of a cent. One penny, left as the
 * rounding it is rather than smeared across the lot.
 *
 * $69.99 is the ordinary shelf price for this box, not a markup. His 2026-10-22
 * Target Online pair cost $77.48 each, which is the same $69.99 at Edmonds'
 * 10.7%, and Fred Meyer Shoreline is on record ringing sealed at plain MSRP.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ITEM = 133869; // 30th Celebration Elite Trainer Box
const EXPECT = '30th Celebration Elite Trainer Box';
const DATE = '2026-10-28';
const QUANTITY = 5;
const UNIT_CENTS = 7734;

const NOTE =
  'Fred Meyer, 18325 Aurora Ave North, Shoreline. Receipt photographed (IMG_2528, 15:06): ' +
  '5 x TRADING CRD $69.99 = $349.95, TAX $36.74, BALANCE $386.77 including an 8 cent ' +
  'checkout bag. Tax is Shoreline 10.50% ($349.95 x 0.105 = $36.7448, printed $36.74). Unit ' +
  'is $69.99 x 1.105 = $77.33895 held as 7734 cents, so five read $386.70 against $386.69 ' +
  'actually paid for the cards; the penny is Kroger rounding the subtotal once.';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [ci] = await sql`select id, name from catalog_items where id = ${ITEM}`;
  if (!ci) throw new Error(`catalog item ${ITEM} missing`);
  if (ci.name !== EXPECT) throw new Error(`catalog ${ITEM} is "${ci.name}", expected "${EXPECT}"`);

  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${ITEM} and purchase_date = ${DATE} and deleted_at is null`;
  if (dupe.n) {
    // Re-runnable on purpose: skip the insert, still print the holdings.
    console.log(`already logged: ${ci.name} on ${DATE}, ${dupe.n} lot(s). Nothing written.`);
  } else {
    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${ITEM}, ${DATE}, ${QUANTITY}, ${UNIT_CENTS},
        'Fred Meyer', 'Shoreline, WA', ${NOTE})
      returning id`;
    console.log(
      `pu#${r.id}  ${DATE}  x${QUANTITY} @ $${(UNIT_CENTS / 100).toFixed(2)}` +
        `  = $${((QUANTITY * UNIT_CENTS) / 100).toFixed(2)}  ${ci.name}`
    );
  }

  // HELD IS NOT SUM(quantity). The first version of this script printed one
  // and called it held, which told him he had 8 when he had 7 and he caught
  // it straight away: the 2026-09-16 Zulu's box sold on eBay two days later.
  // Rips, decompositions and sales all come off, attributed per LOT.
  // [[reference_pokestonks_held_qty]], [[feedback_adhoc_holdings_query_shape]]
  const lots = await sql`select p.id, p.purchase_date::text d, p.quantity, p.cost_cents, p.source,
      (select count(*)::int from rips r where r.source_purchase_id = p.id) rips,
      (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id) decomps,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p where p.catalog_item_id = ${ITEM} and p.deleted_at is null
    order by p.purchase_date, p.id`;
  let bought = 0, held = 0, basis = 0;
  console.log('\nevery 30th Celebration ETB lot:');
  for (const l of lots) {
    const h = l.quantity - l.rips - l.decomps - l.sold;
    bought += l.quantity;
    held += h;
    basis += h * l.cost_cents;
    console.log(
      `  ${l.d}  bought ${l.quantity} @ $${(l.cost_cents / 100).toFixed(2)}  ${l.source}` +
        (h === l.quantity ? '' : `   -> ${h} left (${l.sold} sold, ${l.rips} ripped, ${l.decomps} broken up)`)
    );
  }
  const [c] = await sql`select coalesce(manual_market_cents, last_market_cents) m
    from catalog_items where id = ${ITEM}`;
  console.log(
    `\nbought ${bought}, held ${held}, $${(basis / 100).toFixed(2)} in on what is left` +
      (c.m ? `, $${((held * c.m) / 100).toFixed(2)} at the $${(c.m / 100).toFixed(2)} market` : '')
  );
  await sql.end();
})();
