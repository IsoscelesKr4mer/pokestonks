import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`INSERT INTO sales (user_id,purchase_id,sale_date,quantity,sale_price_cents,fees_cents,matched_cost_cents,platform,notes,sale_group_id)
    VALUES ('66200525-2237-4cc3-948f-aaafd3253d4b',497,'2026-07-24',1,7000,0,3000,'Venmo (local)',
    'Ascended Heroes bundle to Mario (Hawaii) $70 - market softer, gave friend discount (usual $80)',gen_random_uuid())
    RETURNING id`;
  console.log('Mario sale id',r[0].id,'-> $70, cost $30, profit $40');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
