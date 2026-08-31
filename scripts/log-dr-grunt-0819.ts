import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Single loose Destined Rivals booster pack, Team Rocket grunt pack art, reported by voice 2026-08-19 ~09:30 Pacific. Logged at the standard $5.00 vending single price. MACHINE NOT STATED, confirm which one and the exact time before writing the drop_log row. Art note: grunts were already the glut (21 spare after the 22 art sets), so this pack does NOT unlock a new set. Ho-Oh is the binding art at 0 remaining.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-19', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('PURCHASE', r[0]);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=17236 AND p.deleted_at IS NULL`)[0].h;
  console.log('LOOSE DR HELD NOW:', held, '| committed 124 (22 art sets x4 + one 36-lot) | spare', held-124);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
