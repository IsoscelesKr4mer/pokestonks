import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r=await sql`SELECT id,player,card_number,parallel,notes FROM baseball_cards WHERE set_name ILIKE '%finest%' AND status='listed' ORDER BY id`;
  console.log('listed Finest:',r.length);
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number} [${x.parallel}] notes=${x.notes||''}`);
  await sql.end();
})();
