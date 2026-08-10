import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT player, parallel, asking_price_cents ap, status FROM baseball_cards
    WHERE set_name ILIKE '%2026 Topps Chrome%' AND jsonb_array_length(photo_urls)>0
    ORDER BY asking_price_cents DESC NULLS LAST`;
  const priced = rows.filter(r=>r.ap!=null);
  const total = priced.reduce((s,r)=>s+r.ap,0);
  console.log('cards:', rows.length, '| priced:', priced.length, '| total $'+(total/100).toFixed(2));
  console.log('top 8:');
  for(const r of rows.slice(0,8)) console.log(`  $${(r.ap/100).toFixed(2)} - ${r.player} (${r.parallel})`);
  const noprice = rows.filter(r=>r.ap==null).map(r=>r.player);
  if(noprice.length) console.log('no price:', noprice.join(', '));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
