import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = (which:string, other:string) => `Edmonds Safeway 09:40, ON the :40 mark. ${which} out on the same drop as the ${other}. This CONFIRMS :40, which had only been inferred from the 30-minute cadence after the :10 mark was established mid-day 2026-08-20. Standard $5.00 vending single.`;
  const d = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-21', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes('Destined Rivals pack','Surging Sparks pack')})
    RETURNING id`;
  console.log('DR pack lot#', d[0].id);
  const s = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 19928, '2026-08-21', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes('Surging Sparks pack','Destined Rivals pack')})
    RETURNING id`;
  console.log('SS pack lot#', s[0].id);
  for (const [ci,label] of [[17236,'Destined Rivals loose pack'],[19928,'Surging Sparks loose pack']] as [number,string][]) {
    const h:any = await sql`
      SELECT COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(quantity) FROM sales sa WHERE sa.purchase_id=p.id),0)),0)::int h
      FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL`;
    console.log(label, 'held now:', h[0].h);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
