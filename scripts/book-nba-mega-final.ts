/**
 * Book eBay order 27-14986-18444: the LAST 2025-26 Topps Chrome Update
 * Basketball Mega Box, sold 2026-08-10 at $134.99.
 *
 *   npx tsx scripts/book-nba-mega-final.ts          # dry run
 *   npx tsx scripts/book-nba-mega-final.ts --write
 *
 * Sold 65 minutes after Michael had the ask cut from $139.99 to $134.99. It
 * had sat at $139.99 since 2026-08-08 with zero watchers.
 *
 * Straight off the Fulfillment API order:
 *   item $134.99 + shipping $6.37 + eBay-collected tax $9.85 = $151.21 basis
 *   fee $20.44 = 13.25% x $151.21 + $0.40, exact
 * Revenue is booked as the item subtotal only; buyer-paid shipping is a wash
 * against the label. The FULL fee is still charged against the item, which is
 * the conservative side of that convention.
 *
 * Closes the mega out: 7 bought, 7 sold, 0 held.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '27-14986-18444';
const SALE_DATE = '2026-08-10';

const PURCHASE_ID = 542;
const PRICE_CENTS = 13499;
const FEE_CENTS = 2044;
const COST_CENTS = 9396;
const SHIP_PAID = 637;
const TAX_COLLECTED = 985;

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

async function main() {
  const dupe = await sql`select * from ebay_synced_orders where ebay_order_id=${ORDER}`;
  if (dupe.length) { console.error(`order ${ORDER} already synced, refusing to double-book`); process.exit(1); }

  const [lot]: any = await sql`
    select p.id, p.quantity, p.cost_cents,
           coalesce((select sum(s.quantity) from sales s where s.purchase_id = p.id), 0) as sold
    from purchases p where p.id = ${PURCHASE_ID} and p.deleted_at is null`;
  if (!lot) throw new Error(`lot ${PURCHASE_ID} missing or deleted`);
  const open = Number(lot.quantity) - Number(lot.sold);
  if (open < 1) throw new Error(`lot ${PURCHASE_ID} has ${open} open units`);
  if (Number(lot.cost_cents) !== COST_CENTS) throw new Error(`lot cost is ${lot.cost_cents}, expected ${COST_CENTS}`);

  const net = PRICE_CENTS - FEE_CENTS;
  console.log(`order ${ORDER}  1x Chrome Update NBA Mega @ $${(PRICE_CENTS / 100).toFixed(2)}`);
  console.log(`  buyer paid $${((PRICE_CENTS + SHIP_PAID + TAX_COLLECTED) / 100).toFixed(2)} (item + $${(SHIP_PAID / 100).toFixed(2)} ship + $${(TAX_COLLECTED / 100).toFixed(2)} tax)`);
  console.log(`  fee   $${(FEE_CENTS / 100).toFixed(2)} on the full $${((PRICE_CENTS + SHIP_PAID + TAX_COLLECTED) / 100).toFixed(2)} basis`);
  console.log(`  cost  $${(COST_CENTS / 100).toFixed(2)} (lot #${PURCHASE_ID}, Target 2026-08-08)`);
  console.log(`  net   $${(net / 100).toFixed(2)} -> profit $${((net - COST_CENTS) / 100).toFixed(2)} (${(((net - COST_CENTS) / COST_CENTS) * 100).toFixed(0)}% ROI)`);
  console.log(`  had it sold at the old $139.99: net $${((13999 - Math.round((13999 + SHIP_PAID + TAX_COLLECTED) * 0.1325) - 40) / 100).toFixed(2)}, so the cut cost ~$4.34`);

  if (!WRITE) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const groupId = randomUUID();
  await sql.begin(async (tx) => {
    const [row] = await tx`
      insert into sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                         fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      values (${USER}, ${PURCHASE_ID}, ${SALE_DATE}, 1, ${PRICE_CENTS},
              ${FEE_CENTS}, ${COST_CENTS}, 'eBay',
              ${`eBay order ${ORDER}, item 168598630696, SKU CHROMEUPD-NBA-MEGA-R3 at $134.99. Buyer total $151.21 (item + $6.37 shipping + $9.85 eBay-collected tax); fee $20.44 = 13.25% x $151.21 + $0.40, exact. Revenue booked as item subtotal only, shipping treated as a wash. LAST of 7 megas, closes the position. Sold 65 minutes after the ask was cut from $139.99 to $134.99 at Michael's direction, having sat at $139.99 since 2026-08-08 with zero watchers.`},
              ${groupId})
      returning id`;
    console.log(`\nsale ${row.id} booked against lot ${PURCHASE_ID}`);
    await tx`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
             values (${USER}, ${ORDER}, ${groupId}, false, now())`;
  });

  const [h] = await sql`select
    coalesce((select sum(quantity) from purchases where catalog_item_id=135078 and deleted_at is null),0)
    - coalesce((select sum(s.quantity) from sales s join purchases p on p.id=s.purchase_id where p.catalog_item_id=135078),0) as held`;
  const [tot]: any = await sql`select count(*)::int n, sum(sale_price_cents)::int rev, sum(fees_cents)::int fee, sum(matched_cost_cents)::int cost
    from sales s join purchases p on p.id=s.purchase_id where p.catalog_item_id=135078`;
  console.log(`megas held now: ${h.held}`);
  console.log(`Chrome Update mega lifetime: ${tot.n} sold | rev $${(tot.rev / 100).toFixed(2)} | fees $${(tot.fee / 100).toFixed(2)} | cost $${(tot.cost / 100).toFixed(2)} | REALIZED $${((tot.rev - tot.fee - tot.cost) / 100).toFixed(2)}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
