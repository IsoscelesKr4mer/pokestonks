import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,for_sale,status,jsonb_array_length(photo_urls) nph FROM baseball_cards WHERE player ILIKE '%kade anderson%' ORDER BY id`;
  for(const x of r) console.log(`id${x.id} [${x.for_sale?'SELL':'PC'}] ${x.status} photos:${x.nph} | ${x.set_name} #${x.card_number??'?'} | ${x.parallel}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
