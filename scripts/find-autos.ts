import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,for_sale,status,asking_price_cents,ebay_item_id,ebay_offer_id,ebay_sku
    FROM baseball_cards WHERE (parallel ILIKE '%auto%' OR notes ILIKE '%auto%') ORDER BY player,id`;
  for(const x of r) console.log(`id${x.id} [${x.for_sale?'SELL':'PC'}] ${x.status} ${x.asking_price_cents!=null?'$'+(x.asking_price_cents/100).toFixed(2):'-'} ${x.ebay_item_id?'LISTED '+x.ebay_item_id+' offer='+x.ebay_offer_id+' sku='+x.ebay_sku:'not listed'} | ${x.player} #${x.card_number??'?'} | ${x.set_name} | ${x.parallel}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
