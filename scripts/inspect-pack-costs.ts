import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  console.log('=== Booster-pack catalog items: lots NOT $5.00 ===');
  const rows = await sql`
    SELECT p.id, ci.id AS cid, ci.name, p.purchase_date, p.quantity, p.cost_cents, p.source, p.notes,
      EXISTS(SELECT 1 FROM box_decompositions d WHERE d.source_purchase_id=p.id) AS from_box_decomp,
      (SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=p.id)::int AS sold_from_lot
    FROM purchases p JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE p.deleted_at IS NULL
      AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
      AND p.cost_cents <> 500
    ORDER BY ci.name, p.purchase_date`;
  if(!rows.length) console.log('  (none — all booster-pack lots already $5.00)');
  for(const r of rows) console.log(`  lot#${r.id} | #${r.cid} ${r.name} | ${r.purchase_date instanceof Date?r.purchase_date.toISOString().slice(0,10):r.purchase_date} | qty${r.quantity} @ $${(r.cost_cents/100).toFixed(2)} | src:${r.source??''} | boxDecomp:${r.from_box_decomp} | soldFromLot:${r.sold_from_lot}`);

  console.log('\n=== summary by pack catalog item (current WAC) ===');
  const sum = await sql`
    SELECT ci.id, ci.name, COUNT(p.id)::int AS lots, MIN(p.cost_cents) AS mn, MAX(p.cost_cents) AS mx, ROUND(AVG(p.cost_cents))::int AS wac
    FROM purchases p JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE p.deleted_at IS NULL AND (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
    GROUP BY ci.id, ci.name ORDER BY ci.name`;
  for(const r of sum) console.log(`  #${r.id} ${r.name}: ${r.lots} lots, cost $${(r.mn/100).toFixed(2)}-$${(r.mx/100).toFixed(2)}, WAC $${(r.wac/100).toFixed(2)}`);
  await sql.end();
}
main();
