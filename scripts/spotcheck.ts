import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,card_number,parallel,asking_price_cents,status,comp_note FROM baseball_cards WHERE id=ANY(${[1,59,8,9,17,60]}) ORDER BY id`;
  for(const x of r) console.log(`id${x.id} ${x.player} #${x.card_number} [${x.parallel}] -> ${x.asking_price_cents!=null?'$'+(x.asking_price_cents/100).toFixed(2):'(unpriced)'} [${x.status}] | ${x.comp_note??''}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
