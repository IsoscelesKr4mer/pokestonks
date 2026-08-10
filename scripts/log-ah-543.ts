import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES ('66200525-2237-4cc3-948f-aaafd3253d4b',76,'2026-07-24',1,3000,'Vending Machine',
    'Edmonds Safeway 5:43 (between :28/:58 marks) - AH bundle sitting there, Charlotte spotted it; left a Pitch Black booster. Likely Mario (Hawaii) $80 sale pending Venmo confirmation') RETURNING id`;
  console.log('AH bundle purchase id',r[0].id);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
