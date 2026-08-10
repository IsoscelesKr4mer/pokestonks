import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,card_number,parallel,photo_urls FROM baseball_cards WHERE id = ANY(${[12,63,64,68,69,71,72]}) ORDER BY id`;
  for(const r of rows){const p=r.photo_urls as string[];console.log(`id${r.id} ${r.player} [${r.parallel}] #${r.card_number??'-'} — ${p.length} photo(s)`);p.forEach(u=>console.log('   '+u.split('/').pop()));}
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
