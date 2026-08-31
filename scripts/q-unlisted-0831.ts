import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r:any = await sql`
    SELECT set_name, count(*) n, count(*) FILTER (WHERE asking_price_cents IS NOT NULL) priced,
           sum(coalesce(asking_price_cents,0)) ask
    FROM baseball_cards WHERE status <> 'listed' AND coalesce(sold_price_cents,0)=0
    GROUP BY 1 ORDER BY 2 DESC`;
  console.log('THE 52 UNLISTED, by set:');
  r.forEach((x:any)=>console.log(`  ${String(x.n).padStart(3)}  ${x.set_name.padEnd(46)} ${x.priced} priced, $${(x.ask/100).toFixed(2)}`));
  const top:any = await sql`
    SELECT player, set_name, card_number, parallel, asking_price_cents a, status
    FROM baseball_cards WHERE status <> 'listed' AND coalesce(sold_price_cents,0)=0
    ORDER BY coalesce(asking_price_cents,0) DESC LIMIT 12`;
  console.log('\nMOST VALUABLE UNLISTED:');
  top.forEach((x:any)=>console.log(`  ${x.a!=null?'$'+(x.a/100).toFixed(2):'no price'} | ${x.player} | ${x.set_name} #${x.card_number} | ${x.parallel} | ${x.status}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
