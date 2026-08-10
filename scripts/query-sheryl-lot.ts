import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const ids = [186,183,31604,5241,33551];
  for(const id of ids){
    const r=(await sql`
      SELECT ci.id, ci.name,
        COALESCE(SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held,
        (SELECT ROUND(AVG(cost_cents)) FROM purchases WHERE catalog_item_id=ci.id AND deleted_at IS NULL) AS wac,
        (SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${id} GROUP BY ci.id, ci.name`)[0];
    console.log(`#${r.id} ${r.name}: held ${r.held} | WAC ${r.wac!=null?'$'+(r.wac/100).toFixed(2):'n/a'} | mkt ${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'n/a'}`);
  }
  // FIFO CR ETB lots (cost varies)
  console.log('\nCR ETB (#186) open lots:');
  const lots=await sql`SELECT cost_cents,(p.quantity-COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)) ql FROM purchases p WHERE catalog_item_id=186 AND deleted_at IS NULL ORDER BY purchase_date`;
  console.log('  '+lots.filter((l:any)=>Number(l.ql)>0).map((l:any)=>`$${(l.cost_cents/100).toFixed(2)}`).join(', '));
  await sql.end();
}
main();
