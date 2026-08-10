import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function held(id:number){
  return (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
}
async function main(){
  const uid='66200525-2237-4cc3-948f-aaafd3253d4b';
  // open AH bundle lot (unsold), FIFO
  const [lot] = await sql<{id:number,cost:number}[]>`
    SELECT p.id, p.cost_cents AS cost FROM purchases p
    WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL
      AND (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)) > 0
    ORDER BY p.purchase_date, p.id LIMIT 1`;
  if(!lot){ console.error('No open AH bundle lot found'); process.exit(1); }
  const [sale] = await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    VALUES (${uid}, ${lot.id}, '2026-07-23', 1, 8000, 0, ${lot.cost}, 'Venmo (local)', 'Ascended Heroes bundle to Mario (Hawaii) $80, like usual', gen_random_uuid())
    RETURNING id, sale_price_cents, matched_cost_cents`;
  console.log(`sale ${sale.id}: $${(sale.sale_price_cents/100).toFixed(2)} - $${(sale.matched_cost_cents/100).toFixed(2)} = +$${((sale.sale_price_cents-sale.matched_cost_cents)/100).toFixed(2)}`);
  console.log('AH bundle held now:', await held(76));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
