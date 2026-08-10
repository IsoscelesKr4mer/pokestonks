import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES ('66200525-2237-4cc3-948f-aaafd3253d4b',17236,'2026-07-24',1,500,'Vending Machine',
    'Edmonds Safeway 4:26 (~:28 mark, 1 min early) - all single pack types available, no bundles; bought DR single, nothing came out after (trigger pulled nothing)') RETURNING id`;
  console.log('DR purchase id',r[0].id);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
