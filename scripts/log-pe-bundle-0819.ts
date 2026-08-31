import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Edmonds Safeway 15:58, ON the :58:30 mark. Standard $30.00 vending bundle price. He left a Surging Sparks booster pack sitting in the machine for the person behind him (logged to drop_log as seen, no purchase). Reported by voice; transcript read "Edmund Safeway", "358" and "Surgeon Sparks", mapped to Edmonds Safeway, 15:58 and Surging Sparks.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 19776, '2026-08-19', 1, 3000, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('PURCHASE', r[0]);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=19776 AND p.deleted_at IS NULL`)[0].h;
  console.log('PE BUNDLE HELD NOW:', held, '| committed 3 to listing 168617484171 | free', held-3);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
