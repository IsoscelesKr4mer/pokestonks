import { config } from 'dotenv'; import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
(async()=>{
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},19928,'2026-07-31',1,500,'Vending Machine',${'Edmonds Safeway 2:37pm - :37 mark, single SS pack'}) RETURNING id`;
  console.log('purchase lot:',r[0].id);
  const held=await sql`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
    FROM purchases p WHERE p.catalog_item_id=19928 AND p.deleted_at IS NULL`;
  console.log('SS packs held now:',held[0].held);
  appendFileSync('data/drop_log.csv','2026-07-31,Friday,14:37,Edmonds Safeway,hit,Surging Sparks Booster Pack,1,5.00,":37 mark - single SS pack; bought (3rd Safeway trip today)"\n');
  console.log('drop_log appended');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
