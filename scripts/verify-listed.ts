import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const c=await sql`SELECT status, COUNT(*)::int n FROM baseball_cards WHERE for_sale=true GROUP BY status ORDER BY status`;
  console.log('sellable by status:'); c.forEach(r=>console.log(`  ${r.status}: ${r.n}`));
  const stuck=await sql`SELECT id,player,card_number,parallel,asking_price_cents FROM baseball_cards WHERE for_sale=true AND status='priced' AND asking_price_cents IS NOT NULL`;
  console.log(`\nstill priced-not-listed (should be 0): ${stuck.length}`);
  stuck.forEach(r=>console.log(`  id${r.id} ${r.player} $${(r.asking_price_cents/100).toFixed(2)}`));
  const listed=await sql`SELECT COUNT(*)::int n FROM baseball_cards WHERE status='listed'`;
  const sumv=await sql`SELECT SUM(asking_price_cents)::int s FROM baseball_cards WHERE status='listed' AND for_sale=true`;
  console.log(`\ntotal listed: ${listed[0].n} | listed asking sum $${(sumv[0].s/100).toFixed(2)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
