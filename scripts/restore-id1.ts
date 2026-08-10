import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  await sql`UPDATE baseball_cards SET asking_price_cents=NULL, status='photographed',
    comp_note='Wide spread: low $19.52 / med $50 / high $375 (eBay Browse) - auction it' WHERE id=1`;
  const r=await sql`SELECT id,player,asking_price_cents,status,notes FROM baseball_cards WHERE id=1`;
  console.log(JSON.stringify(r[0]));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
