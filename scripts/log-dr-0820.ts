import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Edmonds Safeway 10:58, ON the :58:30 mark. Standard $5.00 vending single-pack price. Reported by voice; transcript read "Destin Rivals" and "Edmund Safeway". PACK ART NOT STATED - ask, because Ho-Oh is the binding art for the loose art-set listing and a Ho-Oh unlocks a whole new $38.99 set on its own.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-20', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id`;
  console.log('PURCHASE lot#', r[0].id);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=17236 AND p.deleted_at IS NULL`)[0].h;
  console.log('LOOSE DR HELD NOW:', held, '| committed 124 (22 art sets x4 + one 36-lot) | spare', held-124);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
