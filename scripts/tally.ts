import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const c=await sql`SELECT status, COUNT(*)::int n FROM baseball_cards WHERE for_sale=true GROUP BY status ORDER BY n DESC`;
  console.log('sellable by status:'); c.forEach(r=>console.log(`  ${r.status}: ${r.n}`));
  const held=await sql`SELECT COUNT(*)::int n FROM baseball_cards WHERE (parallel ILIKE '%(CONFIRM)%' OR notes ILIKE '%confirm parallel%')`;
  console.log('held for parallel-confirm:', held[0].n);
  const stuck=await sql`SELECT id,player,parallel FROM baseball_cards WHERE for_sale=true AND status='priced' AND asking_price_cents IS NOT NULL AND coalesce(parallel,'') NOT ILIKE '%CONFIRM%' AND coalesce(notes,'') NOT ILIKE '%confirm parallel%' AND coalesce(notes,'') NOT ILIKE '%in-person auto%'`;
  console.log('confident priced-not-listed (should be ~0):', stuck.length);
  const tot=await sql`SELECT COUNT(*)::int n FROM baseball_cards`;
  const listed=await sql`SELECT COUNT(*)::int n FROM baseball_cards WHERE status='listed'`;
  console.log(`collection total ${tot[0].n} | listed ${listed[0].n}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
