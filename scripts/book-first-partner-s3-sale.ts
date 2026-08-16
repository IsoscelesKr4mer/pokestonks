/**
 * Book eBay order 15-15007-44126: 1x First Partner Illustration Collection
 * (Series 3) at $33.99, sold 2026-08-11.
 *
 *   npx tsx scripts/book-first-partner-s3-sale.ts          # dry run
 *   npx tsx scripts/book-first-partner-s3-sale.ts --write
 *
 * Listed 2026-08-10 23:39 UTC, sold 2026-08-11 05:19 UTC. **5 hours 40
 * minutes.** Already fulfilled, tracking 9400108106244426731734.
 *
 * This is the sale that proves the $33.99 ask was correct, and it refutes the
 * comp analysis I ran a few hours later suggesting a cut to $29.99. See the
 * note in memory: check for an actual SALE before diagnosing a pricing
 * problem. Orders are authoritative; an active-listing comp scan is inference.
 *
 * Off the Fulfillment API order:
 *   item $33.99 + shipping $6.95 + eBay-collected tax $2.60 = $43.54 basis
 *   fee $6.17 = 13.25% x $43.54 + $0.40, exact
 * Revenue booked as item subtotal only; buyer-paid shipping is a wash.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '15-15007-44126';
const SALE_DATE = '2026-08-11';

const PURCHASE_ID = 549 - 1; // lot #548, the First Partner S3 buy
const PRICE_CENTS = 3399;
const FEE_CENTS = 617;
const COST_CENTS = 1988;
const SHIP_PAID = 695;
const TAX_COLLECTED = 260;

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

async function main() {
  const dupe = await sql`select * from ebay_synced_orders where ebay_order_id=${ORDER}`;
  if (dupe.length) { console.error(`order ${ORDER} already synced, refusing to double-book`); process.exit(1); }

  const [lot]: any = await sql`
    select p.id, p.quantity, p.cost_cents, c.name,
           coalesce((select sum(s.quantity) from sales s where s.purchase_id = p.id), 0) as sold
    from purchases p join catalog_items c on c.id = p.catalog_item_id
    where p.id = ${PURCHASE_ID} and p.deleted_at is null`;
  if (!lot) throw new Error(`lot ${PURCHASE_ID} missing`);
  if (!/First Partner/i.test(lot.name)) throw new Error(`lot ${PURCHASE_ID} is "${lot.name}", not First Partner`);
  const open = Number(lot.quantity) - Number(lot.sold);
  if (open < 1) throw new Error(`lot ${PURCHASE_ID} has ${open} open units`);
  if (Number(lot.cost_cents) !== COST_CENTS) throw new Error(`lot cost ${lot.cost_cents}, expected ${COST_CENTS}`);

  const net = PRICE_CENTS - FEE_CENTS;
  console.log(`order ${ORDER}  1x ${lot.name} @ $${(PRICE_CENTS / 100).toFixed(2)}`);
  console.log(`  buyer paid $${((PRICE_CENTS + SHIP_PAID + TAX_COLLECTED) / 100).toFixed(2)} (item + $${(SHIP_PAID / 100).toFixed(2)} ship + $${(TAX_COLLECTED / 100).toFixed(2)} tax)`);
  console.log(`  fee   $${(FEE_CENTS / 100).toFixed(2)} | cost $${(COST_CENTS / 100).toFixed(2)} (lot #${PURCHASE_ID})`);
  console.log(`  net   $${(net / 100).toFixed(2)} -> profit $${((net - COST_CENTS) / 100).toFixed(2)} (${(((net - COST_CENTS) / COST_CENTS) * 100).toFixed(0)}% ROI)`);
  console.log(`  time to sell: 5h 40m from listing`);

  if (!WRITE) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const groupId = randomUUID();
  await sql.begin(async (tx) => {
    const [row] = await tx`
      insert into sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                         fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      values (${USER}, ${PURCHASE_ID}, ${SALE_DATE}, 1, ${PRICE_CENTS},
              ${FEE_CENTS}, ${COST_CENTS}, 'eBay',
              ${`eBay order ${ORDER}, item 168604150072, SKU FPIC-S3 at $33.99. Buyer total $43.54 (item + $6.95 shipping + $2.60 eBay-collected tax); fee $6.17 = 13.25% x $43.54 + $0.40, exact. Revenue booked as item subtotal only, shipping a wash. SOLD IN 5H40M from listing, which validates the $33.99 ask and refutes the later comp scan that suggested cutting to $29.99.`},
              ${groupId})
      returning id`;
    console.log(`\nsale ${row.id} booked against lot ${PURCHASE_ID}`);
    await tx`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
             values (${USER}, ${ORDER}, ${groupId}, false, now())`;
  });

  const [h] = await sql`select
    coalesce((select sum(quantity) from purchases where catalog_item_id=135080 and deleted_at is null),0)
    - coalesce((select sum(s.quantity) from sales s join purchases p on p.id=s.purchase_id where p.catalog_item_id=135080),0) as held`;
  console.log(`First Partner S3 held now: ${h.held} (listing should show qty 1)`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
