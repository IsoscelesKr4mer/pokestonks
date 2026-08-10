import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT id, player, set_name, parallel, (photo_urls->>0) AS front FROM baseball_cards WHERE player ILIKE '%bautista%' ORDER BY id`;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
