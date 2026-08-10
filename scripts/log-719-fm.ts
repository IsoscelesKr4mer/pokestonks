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
  const b=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-19', 2, 500, 'Vending Machine', 'Shoreline Fred Meyer 12:38 - 2 DR packs; another buyer swept 3 bundles same visit')`;
  console.log(`Destined Rivals pack: held ${b} -> ${await held(17236)}`);
  const rows=[
    '2026-07-19,Sunday,12:38,Shoreline Fred Meyer,hit,Destined Rivals Booster Pack,2,5.00,2 DR packs; arrived early (~:38) before the :46',
    '2026-07-19,Sunday,12:38,Shoreline Fred Meyer,seen,White Flare Booster Bundle,0,,BUNDLE - another buyer camping the machine took it (Michael got none)',
    '2026-07-19,Sunday,12:38,Shoreline Fred Meyer,seen,Prismatic Evolutions Booster Bundle,0,,BUNDLE - taken by the same buyer',
    '2026-07-19,Sunday,12:38,Shoreline Fred Meyer,seen,Ascended Heroes Booster Bundle,0,,BUNDLE - EARLY-PULL by the other buyer (pulled the next drop in); 3 bundles swept in one visit - unprecedented per Michael',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +4 (2x DR hit + 3 bundles swept by another buyer)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
