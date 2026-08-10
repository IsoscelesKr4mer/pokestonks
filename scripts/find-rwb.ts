import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,parallel FROM baseball_cards WHERE parallel ILIKE '%red%white%' OR parallel ILIKE '%RWB%' OR parallel ILIKE '%white%blue%' ORDER BY id`;
  for(const x of r) console.log(JSON.stringify(x));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
