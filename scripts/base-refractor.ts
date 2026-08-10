import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,asking_price_cents,status FROM baseball_cards WHERE parallel ILIKE '%base Refractor%' ORDER BY id`;
  console.log(`${r.length} cards labeled "base Refractor":`);
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number} | ${x.set_name} | $${x.asking_price_cents!=null?(x.asking_price_cents/100).toFixed(2):'-'} [${x.status}]`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
