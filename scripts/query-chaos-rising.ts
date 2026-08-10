import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== mapping for CR listing 168431994161 ===');
  const m = await sql`SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id='168431994161'`;
  console.log(JSON.stringify(m[0]?.mappings));

  console.log('\n=== Chaos Rising catalog items: WAC + FIFO-oldest cost + held ===');
  const rows = await sql`
    SELECT ci.id, ci.name,
      (SELECT ROUND(AVG(p.cost_cents)) FROM purchases p WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL) AS wac,
      COALESCE((SELECT SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))
        FROM purchases p WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL),0)::int AS held
    FROM catalog_items ci
    WHERE lower(ci.name) LIKE '%chaos rising%' AND (lower(ci.name) LIKE '%elite trainer%' OR lower(ci.name) LIKE '%booster bundle%')
    ORDER BY ci.name`;
  for (const r of rows) console.log(`#${r.id} ${r.name} | WAC ${r.wac!=null?'$'+(r.wac/100).toFixed(2):'n/a'} | held ${r.held}`);

  console.log('\n=== oldest open lots (FIFO) for those items ===');
  for (const r of rows) {
    const lots = await sql`
      SELECT p.id, p.purchase_date, p.cost_cents,
        (p.quantity - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)) AS qty_left
      FROM purchases p WHERE p.catalog_item_id=${r.id} AND p.deleted_at IS NULL
      ORDER BY p.purchase_date, p.created_at`;
    const open = lots.filter((l:any)=>Number(l.qty_left)>0);
    console.log(`#${r.id} ${r.name}: ` + (open.length? open.map((l:any)=>`$${(l.cost_cents/100).toFixed(2)}x${l.qty_left}`).join(', ') : 'no open lots'));
  }
  await sql.end();
}
main();
