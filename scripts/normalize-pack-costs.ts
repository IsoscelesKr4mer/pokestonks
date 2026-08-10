import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const isPack = (alias:string)=>sql`(${sql(alias)}.product_type ILIKE '%booster pack%' OR ${sql(alias)}.name ILIKE '%booster pack%')`;
async function main(){
  let purUpd=0, salUpd=0, realizedDelta=0;
  await sql.begin(async (tx)=>{
    // realized delta first (how much sold matched_cost will drop)
    const d = (await tx`SELECT COALESCE(SUM((s.matched_cost_cents-500)*s.quantity),0)::int AS delta
      FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
      WHERE (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%') AND s.matched_cost_cents<>500`)[0];
    realizedDelta = d.delta;
    const r1 = await tx`UPDATE purchases p SET cost_cents=500 FROM catalog_items ci
      WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%') AND p.cost_cents<>500`;
    purUpd = r1.count;
    const r2 = await tx`UPDATE sales s SET matched_cost_cents=500 FROM purchases p JOIN catalog_items ci ON p.catalog_item_id=ci.id
      WHERE s.purchase_id=p.id AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%') AND s.matched_cost_cents<>500`;
    salUpd = r2.count;
  });
  console.log(`purchase lots set to $5: ${purUpd}`);
  console.log(`sold sale rows matched_cost set to $5: ${salUpd}`);
  console.log(`realized profit increases by: $${(realizedDelta/100).toFixed(2)}`);
  console.log('\n=== pack WACs now ===');
  const sum = await sql`SELECT ci.name, ROUND(AVG(p.cost_cents))::int AS wac, MIN(p.cost_cents) mn, MAX(p.cost_cents) mx
    FROM purchases p JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE p.deleted_at IS NULL AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
    GROUP BY ci.name ORDER BY ci.name`;
  for(const r of sum) console.log(`  ${r.name}: WAC $${(r.wac/100).toFixed(2)} (range $${(r.mn/100).toFixed(2)}-$${(r.mx/100).toFixed(2)})`);
  await sql.end();
}
main();
