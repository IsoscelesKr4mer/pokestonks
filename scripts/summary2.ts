import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,card_number,parallel,asking_price_cents FROM baseball_cards WHERE id>127 ORDER BY id`;
  for(const r of rows) console.log(`  id${r.id} $${r.asking_price_cents!=null?(r.asking_price_cents/100).toFixed(2):'--'}  ${r.player} #${r.card_number} [${r.parallel}]`);
  const bf=await sql`SELECT id,player,card_number FROM baseball_cards WHERE id IN (64,69,71,102)`;
  console.log('backfilled #:'); for(const r of bf) console.log(`  id${r.id} ${r.player} #${r.card_number}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
