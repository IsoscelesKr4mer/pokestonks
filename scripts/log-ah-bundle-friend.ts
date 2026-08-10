import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const userId = '66200525-2237-4cc3-948f-aaafd3253d4b';
  // oldest open lot for AH Booster Bundle #76
  const lots = await sql`
    SELECT p.id, p.cost_cents,
      (p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS qty_left
    FROM purchases p WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.created_at`;
  const open = lots.filter((l:any)=>Number(l.qty_left)>0);
  if (!open.length) throw new Error('no open AH bundle lots');
  const lot = open[0];
  const gid = randomUUID();
  await sql`INSERT INTO sales ${sql({
    user_id:userId, sale_group_id:gid, purchase_id:Number(lot.id),
    sale_date: new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'}), quantity:1, sale_price_cents:8500, fees_cents:0,
    matched_cost_cents:Number(lot.cost_cents), platform:'Venmo',
    notes:'Friend (Hawaii batch ship) - AH Booster Bundle at $85 homie price',
  },'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
  console.log(`logged: AH bundle sale $85.00, matched cost $${(Number(lot.cost_cents)/100).toFixed(2)}, profit $${((8500-Number(lot.cost_cents))/100).toFixed(2)}`);
  const h=(await sql`SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
    FROM purchases p WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL`)[0];
  console.log(`AH Booster Bundle (#76) held now: ${h.held}`);
  await sql.end();
}
main();
