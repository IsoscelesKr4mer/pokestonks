import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // Correct: every sold pack = $5, so a row's total matched cost = quantity * 500
  const r = await sql`UPDATE sales s SET matched_cost_cents = s.quantity*500
    FROM purchases p JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE s.purchase_id=p.id
      AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
      AND s.matched_cost_cents <> s.quantity*500`;
  console.log('rows corrected to quantity*$5:', r.count);

  // sanity: any pack row where matched_cost != quantity*500 ?
  const bad = await sql`SELECT COUNT(*)::int c FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%') AND s.matched_cost_cents <> s.quantity*500`;
  console.log('remaining mismatched pack rows:', bad[0].c);

  console.log('\n=== realized P&L on pack sales now (cost = $5/pack) ===');
  const tot = await sql`SELECT SUM(s.sale_price_cents)::int sp, SUM(s.matched_cost_cents)::int mc, SUM(s.fees_cents)::int f, SUM(s.quantity)::int q
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')`;
  const t=tot[0];
  console.log(`  packs sold ${t.q} | revenue $${(t.sp/100).toFixed(2)} | cost $${(t.mc/100).toFixed(2)} (=${t.q}x$5) | fees $${(t.f/100).toFixed(2)} | realized profit $${((t.sp-t.mc-t.f)/100).toFixed(2)}`);
  await sql.end();
}
main();
