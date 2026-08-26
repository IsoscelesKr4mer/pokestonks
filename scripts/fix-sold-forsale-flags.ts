/**
 * Three cards are status='sold' but still for_sale=true. All three point at
 * Completed listings, so nothing is live, but the flag is wrong and a future
 * lister change could act on it.
 *
 *   npx tsx scripts/fix-sold-forsale-flags.ts --apply
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r:any = await sql`SELECT id, player, sold_date::text sd FROM baseball_cards WHERE status='sold' AND for_sale=true ORDER BY id`;
  r.forEach((x:any)=>console.log(`  #${x.id} ${x.player} sold ${x.sd} -> for_sale false`));
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  const u:any = await sql`UPDATE baseball_cards SET for_sale=false, updated_at=now() WHERE status='sold' AND for_sale=true RETURNING id`;
  console.log(`cleared for_sale on ${u.length} sold rows`);
  const [c]:any = await sql`SELECT COUNT(*)::int n FROM baseball_cards WHERE status='sold' AND for_sale=true`;
  console.log(`remaining sold+for_sale rows: ${c.n}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
