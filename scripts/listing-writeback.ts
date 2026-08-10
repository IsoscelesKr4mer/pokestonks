import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
// [id, itemId, offerId, sku]
const done:[number,string,string,string][] = [
  [65,'168561651114','215874119011','BBC-65'],
  [130,'168561651279','215874352011','BBC-130'],
];
async function main(){
  for(const [id,item,offer,skuv] of done){
    await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${item}, ebay_offer_id=${offer}, ebay_sku=${skuv} WHERE id=${id}`;
  }
  const r=await sql`SELECT id,player,status,ebay_item_id FROM baseball_cards WHERE id=ANY(${done.map(d=>d[0])})`;
  for(const x of r) console.log(`id${x.id} ${x.player} -> ${x.status} item ${x.ebay_item_id}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
