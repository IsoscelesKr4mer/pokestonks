import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  console.log('=== RayWave naming ===');
  const rw=await sql`SELECT id,player,parallel FROM baseball_cards WHERE parallel ILIKE '%ray%wave%' ORDER BY id`;
  for(const x of rw) console.log(JSON.stringify(x));
  console.log('=== ALL Baseball Seams cards ===');
  const r=await sql`SELECT id,player,set_name,card_number,parallel,status,asking_price_cents,ebay_sku,ebay_offer_id,ebay_item_id FROM baseball_cards WHERE parallel ILIKE '%seams%' ORDER BY id`;
  for(const x of r) console.log(JSON.stringify(x));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
