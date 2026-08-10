import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel,needs_back_photo,status,photo_urls FROM baseball_cards WHERE player ILIKE '%de la cruz%' ORDER BY id`;
  for(const x of r){ const p=x.photo_urls as string[];
    console.log(`id${x.id} ${x.player} | ${x.set_name} #${x.card_number??'?'} [${x.parallel}] | needs_back=${x.needs_back_photo} status=${x.status} | ${p.length} photos`);
    p.forEach(u=>console.log('    '+u.split('/').pop()));
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
