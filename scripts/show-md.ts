import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT player,card_number,asking_price_cents,comp_note FROM baseball_cards WHERE parallel ILIKE '%mini diamond%' ORDER BY asking_price_cents DESC NULLS LAST`;
  for(const x of r) console.log(`  $${x.asking_price_cents!=null?(x.asking_price_cents/100).toFixed(2):'--'}  ${x.player} #${x.card_number}  | ${x.comp_note??'no comps'}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
