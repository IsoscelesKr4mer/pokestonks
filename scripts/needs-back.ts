import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,set_name,card_number,parallel,needs_back_photo,jsonb_array_length(photo_urls) nph
    FROM baseball_cards WHERE for_sale=true AND (needs_back_photo=true OR jsonb_array_length(photo_urls)<2) ORDER BY player`;
  console.log(`${rows.length} sellable cards missing a back:`);
  for(const r of rows) console.log(`  id${r.id} ${r.player} | ${r.set_name} #${r.card_number??'?'} | ${r.parallel} | photos:${r.nph}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
