import { config } from 'dotenv';
import postgres from 'postgres';
import { appendFileSync } from 'fs';
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
  const drB=await held(17236), ahB=await held(76);
  // DR pack kept
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-20', 1, 500, 'Vending Machine', 'Edmonds Safeway 5:58 big drop - kept 1 DR pack')`;
  // AH bundle bought for Mario
  const [ahPur] = await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 76, '2026-07-20', 1, 3000, 'Vending Machine', 'Edmonds Safeway 5:58 - AH bundle for Mario (Hawaii)')
    RETURNING id`;
  // Sale to Mario
  const [sale] = await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    VALUES (${uid}, ${ahPur.id}, '2026-07-20', 1, 8000, 0, 3000, 'Venmo (local)', 'Ascended Heroes bundle to Mario (Hawaii), like usual', gen_random_uuid())
    RETURNING sale_price_cents, matched_cost_cents`;
  console.log(`DR pack: held ${drB} -> ${await held(17236)}`);
  console.log(`AH bundle: held ${ahB} -> ${await held(76)} (bought+sold same day)`);
  console.log(`AH sale: $${(sale.sale_price_cents/100).toFixed(2)} - $${(sale.matched_cost_cents/100).toFixed(2)} = +$${((sale.sale_price_cents-sale.matched_cost_cents)/100).toFixed(2)} realized`);
  const rows=[
    '2026-07-20,Monday,17:58,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,big drop; kept 1 DR',
    '2026-07-20,Monday,17:58,Edmonds Safeway,hit,Ascended Heroes Booster Bundle,1,30.00,BUNDLE - bought for Mario (Hawaii), flipped to him ~$80',
    '2026-07-20,Monday,17:58,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,big drop - left it',
    '2026-07-20,Monday,17:58,Edmonds Safeway,seen,Journey Together Booster Pack,0,,big drop - left it',
    '2026-07-20,Monday,17:58,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,big drop - left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +5 (DR + AH hits, SS/JT/PO seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
