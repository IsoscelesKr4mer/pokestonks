import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,photo_urls FROM baseball_cards WHERE id = ANY(${[9,60,71,89]}) ORDER BY id`;
  for(const r of rows) console.log(`id${r.id} ${r.player}\n  ${(r.photo_urls as string[]).join('\n  ')}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
