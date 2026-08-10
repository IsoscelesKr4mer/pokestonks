import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // Felnin auto: was listed, now withdrawn -> reset to unlisted + flag in-person auto
  await sql`UPDATE baseball_cards SET status='photographed', asking_price_cents=NULL,
    ebay_item_id=NULL, ebay_offer_id=NULL, ebay_sku=NULL,
    notes='IN-PERSON AUTO (Michael) - do not bulk-price/list; way underpriced, price by hand or hold' WHERE id=131`;
  // Josh Caron autos: never listed; clear lowball price + flag
  await sql`UPDATE baseball_cards SET asking_price_cents=NULL, status='photographed',
    notes='IN-PERSON AUTO (Michael) - do not bulk-price/list; price by hand or hold' WHERE id IN (43,29)`;
  const r=await sql`SELECT id,player,status,asking_price_cents,ebay_item_id FROM baseball_cards WHERE id IN (131,43,29) ORDER BY id`;
  for(const x of r) console.log(`id${x.id} ${x.player} -> ${x.status} price:${x.asking_price_cents} listed:${x.ebay_item_id??'no'}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
