import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,status,for_sale,asking_price_cents,ebay_item_id,ebay_offer_id,ebay_sku,notes FROM baseball_cards WHERE player ILIKE '%donovan%' ORDER BY id`;
  for(const x of r) console.log(JSON.stringify(x,null,1));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
