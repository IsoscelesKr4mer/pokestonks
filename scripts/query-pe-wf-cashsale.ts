import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT ci.id, ci.name
    FROM catalog_items ci
    WHERE (lower(ci.name) LIKE '%prismatic%' AND lower(ci.name) LIKE '%booster bundle%' AND lower(ci.name) NOT LIKE '%case%' AND lower(ci.name) NOT LIKE '%display%')
       OR ci.id = 31604
    ORDER BY ci.name`;
  for (const r of rows) {
    const lots = await sql`
      SELECT p.purchase_date, p.cost_cents,
        (p.quantity - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)) AS qty_left
      FROM purchases p WHERE p.catalog_item_id=${r.id} AND p.deleted_at IS NULL
      ORDER BY p.purchase_date, p.created_at`;
    const open = lots.filter((l:any)=>Number(l.qty_left)>0);
    const held = open.reduce((a:number,l:any)=>a+Number(l.qty_left),0);
    console.log(`#${r.id} ${r.name}: held ${held} | open lots: ` + (open.length? open.map((l:any)=>`$${(l.cost_cents/100).toFixed(2)}x${l.qty_left}`).join(', ') : 'none'));
  }
  await sql.end();
}
main();
