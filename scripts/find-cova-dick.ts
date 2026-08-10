import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,status,for_sale,needs_back_photo,asking_price_cents,ebay_item_id,ebay_offer_id,ebay_sku,photo_urls,notes FROM baseball_cards WHERE player ILIKE '%cova%' OR player ILIKE '%dickerson%' ORDER BY player,id`;
  for(const x of r){ const {photo_urls,...rest}=x; console.log(JSON.stringify(rest)); console.log('   photos:',Array.isArray(photo_urls)?photo_urls.length+' -> '+JSON.stringify(photo_urls):photo_urls); }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
