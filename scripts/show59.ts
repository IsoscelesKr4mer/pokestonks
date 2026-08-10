import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT player,card_number,parallel,asking_price_cents,comp_note FROM baseball_cards WHERE id=59`;
  console.log(`  ${r[0].player} #${r[0].card_number} [${r[0].parallel}] -> $${r[0].asking_price_cents!=null?(r[0].asking_price_cents/100).toFixed(2):'--'} | ${r[0].comp_note??'no comps'}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
