import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function held(id:number){
  return (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
}
async function main(){
  const uid = '66200525-2237-4cc3-948f-aaafd3253d4b';
  const b = await held(19843);
  await sql`INSERT INTO rips (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
    VALUES (${uid}, 464, '2026-07-15', 500, 0, 'Ripped for fun at Fred Meyer - hit a card, listing the pull as a single')`;
  console.log(`Perfect Order pack: held ${b} -> ${await held(19843)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
