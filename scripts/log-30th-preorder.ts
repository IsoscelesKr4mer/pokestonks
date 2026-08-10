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
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  const note='Pokemon Center online pre-order (ordered 2026-07-15), inbound; cost tax-in';
  const items:[number,number,number,string][] = [
    [134518, 2, 6641, '30th Celebration Pokemon Center ETB'],
    [133870, 1, 1659, 'Tech Sticker Collection [Alolan Exeggutor]'],
    [133872, 1, 1659, 'Tech Sticker Collection [Lucario]'],
    [133878, 1, 1106, 'Knock Out Collection'],
  ];
  for (const [cid, qty, cost, label] of items){
    await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
      VALUES (${uid}, ${cid}, '2026-07-15', ${qty}, ${cost}, 'Pokemon Center', ${note})`;
    console.log(`${label}: +${qty} @ $${(cost/100).toFixed(2)} -> held ${await held(cid)}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
