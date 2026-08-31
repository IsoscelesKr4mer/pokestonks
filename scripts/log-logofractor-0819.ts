import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const ci = await sql`
    INSERT INTO catalog_items (kind, name, set_name, product_type, msrp_cents, pack_count, manual_market_cents, manual_market_at, release_date)
    VALUES ('sealed', '2026 Topps Chrome Baseball Logofractor Edition Box', '2026 Topps Chrome Logofractor', 'Collector Box', 11999, 6, 11999, NOW(), '2026-08-19')
    RETURNING id, name`;
  const id = Number(ci[0].id);
  console.log('CATALOG ITEM', ci[0]);
  const notes = 'Ordered direct from topps.com on release day 2026-08-19, NOT IN HAND. $119.99 each x3. COST IS ESTIMATED: grossed up at the 10.7% effective WA rate = $132.83, assuming Topps charged sales tax and free shipping on a $359.97 order. SEND THE TOPPS ORDER TOTAL AND FIX THIS LOT. Box: 6 packs, 5 cards per pack, 30 total cards, exclusive Logofractor parallels. Release was 2026-08-19 online through Topps (Aug 5 early at the MLB NYC flagship). manual_market_cents seeded at MSRP $119.99, there is no market feed for this. 2 of the 3 listed as presale, 1 held.';
  const p = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, ${id}, '2026-08-19', 3, 13283, 'Topps.com', 'Online', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('PURCHASE', p[0]);
  const cost = 13283;
  const be = (cost + 40) / 0.847;
  console.log(`BREAK-EVEN ASK: $${(be/100).toFixed(2)}`);
  for (const ask of [15999, 16999, 17999, 18999]) {
    const net = ask * 0.847 - 40;
    console.log(`  ask $${(ask/100).toFixed(2)} -> net $${(net/100).toFixed(2)} = ${net-cost>=0?'+':''}$${((net-cost)/100).toFixed(2)}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
