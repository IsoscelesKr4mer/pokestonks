/**
 * Book eBay order 18-15001-05305: the last 2 Topps Chrome Update NBA Value
 * Blasters, sold together at the $64.99 ask on 2026-08-10.
 *
 *   npx tsx scripts/book-nba-blaster-final2.ts          # dry run
 *   npx tsx scripts/book-nba-blaster-final2.ts --write
 *
 * Michael turned down a $120 offer for the pair earlier the same day and they
 * then sold at full ask. He was right to hold, see the maths printed below.
 *
 * FIFO across two lots, so this is two sale rows sharing one sale_group_id:
 *   lot 534  Dick's 2026-08-06  $45.92  (1 unit left, the other went on sale 457)
 *   lot 543  Target 2026-08-08  $49.74
 *
 * Revenue is the item subtotal only. Buyer-paid shipping ($10.80) is a wash
 * against the label, consistent with every other eBay sale in this table.
 * The full eBay fee is still booked against the item, which is the
 * conservative side of that convention.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '18-15001-05305';
const SALE_DATE = '2026-08-10';

// Straight off the Fulfillment API order.
const SUBTOTAL = 12998; // 2 x $64.99
const FEE_TOTAL = 1905; // totalMarketplaceFee, = 13.25% x $140.78 + $0.40
const SHIP_PAID = 1080;

// FIFO: oldest open lot first.
const LEGS = [
  { purchaseId: 543, costCents: 4974, priceCents: 6499, feeCents: 953 },
  { purchaseId: 534, costCents: 4592, priceCents: 6499, feeCents: 952 },
];

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

async function main() {
  // Never book the same order twice.
  const dupe = await sql`select * from ebay_synced_orders where ebay_order_id=${ORDER}`;
  if (dupe.length) {
    console.error(`order ${ORDER} is already synced, refusing to double-book`);
    process.exit(1);
  }

  // Confirm the lots really are open before matching against them.
  const lots = await sql`
    select p.id, p.quantity, p.cost_cents,
           coalesce((select sum(s.quantity) from sales s where s.purchase_id = p.id), 0) as sold
    from purchases p where p.id = any(${LEGS.map((l) => l.purchaseId)}) and p.deleted_at is null`;
  for (const leg of LEGS) {
    const lot: any = lots.find((l: any) => Number(l.id) === leg.purchaseId);
    if (!lot) throw new Error(`lot ${leg.purchaseId} missing or deleted`);
    const open = Number(lot.quantity) - Number(lot.sold);
    if (open < 1) throw new Error(`lot ${leg.purchaseId} has ${open} open units, cannot match`);
    if (Number(lot.cost_cents) !== leg.costCents) {
      throw new Error(`lot ${leg.purchaseId} cost is ${lot.cost_cents}, script expects ${leg.costCents}`);
    }
  }

  const cost = LEGS.reduce((a, l) => a + l.costCents, 0);
  const net = SUBTOTAL - FEE_TOTAL;
  console.log(`order ${ORDER}  2 x Value Blaster @ $64.99`);
  console.log(`  revenue   $${(SUBTOTAL / 100).toFixed(2)}  (buyer also paid $${(SHIP_PAID / 100).toFixed(2)} shipping, treated as a wash)`);
  console.log(`  eBay fee  $${(FEE_TOTAL / 100).toFixed(2)}`);
  console.log(`  cost      $${(cost / 100).toFixed(2)}  (lot 543 $49.74 + lot 534 $45.92)`);
  console.log(`  profit    $${((net - cost) / 100).toFixed(2)}  on $${(cost / 100).toFixed(2)} in, ${(((net - cost) / cost) * 100).toFixed(0)}% ROI`);

  // What the declined offer would actually have paid, same fee formula.
  const offerFee = Math.round(0.1325 * (12000 + SHIP_PAID)) + 40;
  const offerProfit = 12000 - offerFee - cost;
  console.log(`\n  the $120 offer would have netted $${((12000 - offerFee) / 100).toFixed(2)}, profit $${(offerProfit / 100).toFixed(2)}`);
  console.log(`  holding was worth $${((net - cost - offerProfit) / 100).toFixed(2)} more`);

  if (!WRITE) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const groupId = randomUUID();
  await sql.begin(async (tx) => {
    for (const leg of LEGS) {
      const [row] = await tx`
        insert into sales (user_id, purchase_id, sale_date, quantity, sale_price_cents,
                           fees_cents, matched_cost_cents, platform, notes, sale_group_id)
        values (${USER}, ${leg.purchaseId}, ${SALE_DATE}, 1, ${leg.priceCents},
                ${leg.feeCents}, ${leg.costCents}, 'eBay',
                ${`eBay order ${ORDER}, item 168594314671, SKU CHROMEUPD-NBA-VALUE at $64.99. Both remaining Value Blasters sold to one buyer (Sports Card Connection). Order total $140.78 incl $10.80 buyer-paid shipping; fee $19.05 = 13.25% x $140.78 + $0.40, split evenly across the two units. Michael declined a $120 offer for the pair earlier the same day and they sold at full ask, worth $8.66 more after fees. FIFO leg on lot ${leg.purchaseId}.`},
                ${groupId})
        returning id`;
      console.log(`sale ${row.id} booked against lot ${leg.purchaseId}`);
    }
    await tx`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped, synced_at)
             values (${USER}, ${ORDER}, ${groupId}, false, now())`;
  });
  console.log(`sale_group_id ${groupId}`);

  const [held] = await sql`
    select coalesce(sum(p.quantity),0) - coalesce((select sum(s.quantity) from sales s
      where s.purchase_id = any(select id from purchases where catalog_item_id=135079)),0) as qty
    from purchases p where p.catalog_item_id=135079 and p.deleted_at is null`;
  console.log(`Value Blasters held now: ${held.qty}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
