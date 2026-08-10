import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,year,card_number,parallel,photo_urls,needs_back_photo FROM baseball_cards WHERE id=59`;
  console.log(JSON.stringify(r[0],null,2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
