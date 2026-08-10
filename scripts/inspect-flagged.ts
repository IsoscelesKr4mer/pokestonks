import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ids=[9,12,20,21,22,23,26,27,28,29,30,31,32,33,37,38,39,40,42,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,60,63,64,68,69,70,71,72,89];
async function main(){
  const rows=await sql`SELECT id,player,set_name,year,card_number,parallel,for_sale FROM baseball_cards WHERE id = ANY(${ids}) ORDER BY id`;
  for(const r of rows) console.log(`${r.id}\t${r.for_sale?'SELL':'PC  '}\t#${r.card_number??'-'}\t${r.player} | ${r.set_name} | y${r.year??'-'} | par:${r.parallel??'-'}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
