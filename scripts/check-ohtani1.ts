import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,parallel,status,asking_price_cents,ebay_item_id,notes FROM baseball_cards WHERE id=1`;
  console.log(JSON.stringify(r[0],null,2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
