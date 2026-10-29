/**
 * Book the 13 30th Celebration Booster Bundles sold to TradePost on 2026-10-19.
 *
 *   npx tsx scripts/book-tradepost-bundles-1019.ts            # dry run
 *   npx tsx scripts/book-tradepost-bundles-1019.ts --apply
 *
 * Michael, 2026-10-29: "i sold the booster bundles on tradeppost... i swear i
 * already told you this wtf". He was right that it happened and I had no
 * record of it: ten days passed with the vault still carrying all 13 as held.
 * Every figure below is read off the order screen he sent, nothing estimated.
 *
 *   Order TPST-F2ZJW5WK, sold Oct 19 2026 10:37 AM, shipped from home
 *   30th Celebration Booster Bundle, Mint
 *   Unit $61.03 x 13            = $793.39 sale total
 *   Label 1 (13 units)  $24.03    STRUCK THROUGH - TradePost covered it
 *   Shipping Insurance   $7.93    charged
 *   Payout                        $785.46
 *
 * 793.39 - 7.93 = 785.46, so the payout reconciles exactly and the struck
 * label really was free. Insurance goes in `fees_cents` the same way the
 * September TradePost labels did (`scripts/book-tradepost-30th-0921.ts`):
 * revenue is the sale total and the channel's cost stays visible as fees,
 * rather than booking the payout as revenue and hiding it.
 *
 * THIRTEEN IS EVERY BUNDLE HE HAD, across all three open lots, so this takes
 * the product to zero:
 *
 *   pu593  2 left of 3  @ $29.82   Pokemon Center  (1 already sold on eBay 9/29)
 *   pu594  3 of 3       @ $29.82   Pokemon Center
 *   pu637  8 of 8       @ $35.36   Target Northgate 10/07
 *
 * One sales row per lot, oldest first, with the gross and the insurance split
 * by unit so each lot carries its own share and the three rows re-add to the
 * order exactly. $431.98 of cost against $785.46 net.
 *
 * NOTE THE DUPE GUARD IS PER LOT **AND DATE**. pu593 already has a sale on it
 * from 2026-09-29, so the usual "any sale on this purchase_id" check would
 * silently skip that lot and book only 11 of the 13.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = 133883;
const EXPECT_NAME = '30th Celebration Booster Bundle';
const DATE = '2026-10-19';
const ORDER = 'TPST-F2ZJW5WK';
const UNIT_CENTS = 6103;
const TOTAL_UNITS = 13;
const SALE_TOTAL = 79339;
const INSURANCE = 793;
const PAYOUT = 78546;

// purchase id, units sold from that lot, expected unit cost cents
const LOTS: [number, number, number][] = [
  [593, 2, 2982],
  [594, 3, 2982],
  [637, 8, 3536],
];

const NOTE =
  `TradePost order ${ORDER}, sold ${DATE} 10:37 AM, shipped from home. ` +
  `13 x 30th Celebration Booster Bundle (Mint) at $61.03 = $793.39 sale total. ` +
  `Label 1 for all 13 units showed $24.03 STRUCK THROUGH, so TradePost covered the ` +
  `shipping; the only deduction was $7.93 shipping insurance, and $793.39 - $7.93 = ` +
  `$785.46 payout as printed. Figures read off the order screen, not estimated. ` +
  `This cleared every bundle on hand across three lots; gross and insurance are ` +
  `split by unit so each lot carries its share.`;

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [ci] = await sql`select id, name from catalog_items where id = ${ITEM}`;
  if (!ci) throw new Error(`catalog item ${ITEM} missing`);
  if (ci.name !== EXPECT_NAME) throw new Error(`catalog ${ITEM} is "${ci.name}"`);

  // Arithmetic has to close before anything touches the database.
  const units = LOTS.reduce((n, l) => n + l[1], 0);
  if (units !== TOTAL_UNITS) throw new Error(`lots sum to ${units} units, expected ${TOTAL_UNITS}`);
  if (UNIT_CENTS * TOTAL_UNITS !== SALE_TOTAL) throw new Error('unit price x qty is not the sale total');
  if (SALE_TOTAL - INSURANCE !== PAYOUT) throw new Error('sale total less insurance is not the payout');

  // Split by unit, with the remainder landing on the last (largest) lot so the
  // three rows re-add to the order to the cent rather than drifting.
  const rows: { pid: number; qty: number; gross: number; fees: number; cost: number }[] = [];
  let grossLeft = SALE_TOTAL;
  let feesLeft = INSURANCE;
  LOTS.forEach(([pid, qty], i) => {
    const last = i === LOTS.length - 1;
    const gross = last ? grossLeft : UNIT_CENTS * qty;
    const fees = last ? feesLeft : Math.round((INSURANCE * qty) / TOTAL_UNITS);
    grossLeft -= gross;
    feesLeft -= fees;
    rows.push({ pid, qty, gross, fees, cost: 0 });
  });
  if (grossLeft !== 0 || feesLeft !== 0) throw new Error('split did not reconcile');

  // Every lot must actually still hold what is being sold out of it.
  for (const r of rows) {
    const [p] = await sql`select p.id, p.quantity, p.cost_cents, c.name,
        (select count(*)::int from rips x where x.source_purchase_id = p.id) rips,
        (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id) decomps,
        coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
      from purchases p join catalog_items c on c.id = p.catalog_item_id
      where p.id = ${r.pid} and p.deleted_at is null`;
    if (!p) throw new Error(`purchase ${r.pid} missing or deleted`);
    if (p.name !== EXPECT_NAME) throw new Error(`pu${r.pid} is "${p.name}"`);
    const expectCost = LOTS.find((l) => l[0] === r.pid)![2];
    if (p.cost_cents !== expectCost) {
      throw new Error(`pu${r.pid} cost is ${p.cost_cents}, expected ${expectCost}`);
    }
    const held = p.quantity - p.rips - p.decomps - p.sold;
    if (held !== r.qty) throw new Error(`pu${r.pid} holds ${held}, selling ${r.qty}`);
    r.cost = p.cost_cents * r.qty;
  }

  const cost = rows.reduce((n, r) => n + r.cost, 0);
  console.log(`${ci.name} -> TradePost ${ORDER}, ${DATE}\n`);
  for (const r of rows) {
    console.log(
      `  pu${r.pid}  x${r.qty}  $${(r.gross / 100).toFixed(2).padStart(7)} gross  ` +
        `$${(r.fees / 100).toFixed(2)} insurance  $${(r.cost / 100).toFixed(2).padStart(7)} cost`
    );
  }
  console.log(
    `\n  $${(SALE_TOTAL / 100).toFixed(2)} sale, $${(INSURANCE / 100).toFixed(2)} insurance, ` +
      `$${(PAYOUT / 100).toFixed(2)} payout, $${(cost / 100).toFixed(2)} cost, ` +
      `+$${((PAYOUT - cost) / 100).toFixed(2)} realised.`
  );

  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    await sql.end();
    return;
  }

  for (const r of rows) {
    // PER LOT AND DATE: pu593 already carries a 2026-09-29 eBay sale.
    const [dupe] = await sql`select count(*)::int n from sales
      where purchase_id = ${r.pid} and sale_date = ${DATE}`;
    if (dupe.n) {
      console.log(`  already booked: pu${r.pid} on ${DATE}`);
      continue;
    }
    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${'66200525-2237-4cc3-948f-aaafd3253d4b'}, ${r.pid}, ${DATE}, ${r.qty},
        ${r.gross}, ${r.fees}, ${r.cost}, 'TradePost', ${NOTE})
      returning id`;
    console.log(`  sale#${s.id}  pu${r.pid}  x${r.qty}  $${(r.gross / 100).toFixed(2)}`);
  }

  // Held must now be zero, read the same way holdings are read everywhere else.
  const lots = await sql`select p.id, p.quantity,
      (select count(*)::int from rips x where x.source_purchase_id = p.id) rips,
      (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id) decomps,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p where p.catalog_item_id = ${ITEM} and p.deleted_at is null`;
  const held = lots.reduce((n: number, l: any) => n + (l.quantity - l.rips - l.decomps - l.sold), 0);
  console.log(
    held === 0
      ? '\nVERIFIED: 0 booster bundles held. The product is cleared out.'
      : `\nWARNING: ${held} still reading as held. Check before trusting this.`
  );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
