import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,set_name,card_number,parallel,for_sale FROM baseball_cards ORDER BY player`;
  console.log('total',rows.length);
  for(const r of rows) console.log(`${r.id}\t${r.for_sale?'S':'P'}\t${r.player} | ${r.set_name??''} | #${r.card_number??'-'} | ${r.parallel??''}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
