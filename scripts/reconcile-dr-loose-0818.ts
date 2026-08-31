import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Inventory reconciliation, not a new buy. Michael sorted the loose Destined Rivals packs by pack art on 2026-08-18 and physically counted 133 (Mewtwo 31, Ho-Oh 22, Team Rocket grunts 43, Cynthia/Garchomp 37) against a vault read of 130. Booked the 3-pack gap at the standard $5.00 vending single price per [[reference_vending_pack_price]], same pattern as the Surging Sparks reconciliation in lot #527. Reverse this lot if the recount was off.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-18', 3, 500, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('RECONCILED', r);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=17236 AND p.deleted_at IS NULL`)[0].h;
  console.log('LOOSE DR HELD NOW:', held);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
