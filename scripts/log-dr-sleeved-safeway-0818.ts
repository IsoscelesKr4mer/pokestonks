import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const notes = 'Safeway store 1297, 23632 Hwy 99, Edmonds WA, 08/18/26 11:34. Receipt: 52 @ $6.99 shelf = $363.48 + $38.89 tax = $402.37 out the door, so $7.74/pack tax included (unit cost rounded up from $7.7379; lot total in DB $402.48, 11c over receipt). 13x each of the four sleeve arts: Cynthia/Garchomp, Giovanni/Mewtwo, Team Rocket grunts/Weezing, Ethan/Ho-Oh. Exactly 13 complete Art Bundle [Set of 4]. UPC 820650104398, item 10-10689-101. Shelf stock Michael had never seen at this store and did not expect to restock, so the whole peg was bought in one go rather than staged.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17232, '2026-08-18', 52, 774, 'Safeway', 'Edmonds, WA', ${notes})
    RETURNING id, purchase_date::text, quantity, cost_cents`;
  console.log('INSERTED', r);
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=17232 AND p.deleted_at IS NULL`)[0].h;
  console.log('SLEEVED DR HELD NOW:', held);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
