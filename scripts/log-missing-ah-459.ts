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
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  // purchase 459 = 2026-07-14 Shoreline Safeway AH bundle, never sold
  const [sale] = await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    VALUES (${uid}, 459, '2026-07-20', 1, 8000, 0, 3000, 'Venmo (local)', 'Ascended Heroes bundle to Mario (Hawaii) $80 - back-logged, sale was missed', gen_random_uuid())
    RETURNING id, sale_price_cents, matched_cost_cents`;
  console.log(`back-logged sale ${sale.id}: +$${((sale.sale_price_cents-sale.matched_cost_cents)/100).toFixed(2)} realized`);
  console.log('AH bundle held now:', await held(76));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
