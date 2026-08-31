import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Second Kayou Naruto buy, 2026-08-19, reported by voice: "nothing has sold yet but I have gotten a good amount of views and some watchers on my Naruto boxes so I just went and bought four more so I am six now." COST AND STORE ASSUMED: same $9.99 shelf at Target Edmonds as lot #580, grossed up at 10.7% = $11.06. He did not state price or store this time. Correct the lot if either differs. Takes total held to 6.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 135082, '2026-08-19', 4, 1106, 'Target', 'Edmonds, WA', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('PURCHASE', r[0]);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=135082 AND p.deleted_at IS NULL`)[0].h;
  console.log('KAYOU HELD NOW:', held, '| committed 2 to listing 168625893567 | free', held-2);
  console.log('total invested $', ((await sql<{t:number}[]>`SELECT SUM(quantity*cost_cents)::int t FROM purchases WHERE catalog_item_id=135082 AND deleted_at IS NULL`)[0].t/100).toFixed(2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
