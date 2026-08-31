import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Edmonds Safeway 14:10. NEW MARK, the old :28/:58 died mid-day. He had three dead pulls in a row (last at ~13:58), went for a sandwich, came back and tapped 14:08 nothing, another customer tapped 14:09 nothing, he tapped 14:10 and a multi-drop came out: Surging Sparks, Destined Rivals and two others he did not note. He took only the Destined Rivals pack. Standard $5.00 vending single. Note the :58 mark still WORKED at 10:58 this same morning, so the shift happened between 10:58 and 13:58 on 2026-08-20.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-20', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id`;
  console.log('DR pack lot#', r[0].id);
  const h:any = await sql`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales sa WHERE sa.purchase_id=p.id),0)),0)::int h
    FROM purchases p WHERE p.catalog_item_id=17236 AND p.deleted_at IS NULL`;
  console.log('Loose DR held now:', h[0].h, '| committed 124 | spare', h[0].h-124);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
