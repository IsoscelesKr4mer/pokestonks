import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const t:any = await sql`
    SELECT count(*) n, count(*) FILTER (WHERE status='listed') listed,
           count(*) FILTER (WHERE ebay_item_id IS NULL) unlisted,
           sum(coalesce(asking_price_cents,0)) ask
    FROM baseball_cards WHERE notes LIKE '%2026-08-31%'`;
  console.log('the 08-31 drop:', JSON.stringify(t[0]));
  const left:any = await sql`
    SELECT id, card_number, player, parallel, comp_note FROM baseball_cards
    WHERE notes LIKE '%2026-08-31%' AND ebay_item_id IS NULL ORDER BY card_number`;
  console.log('\nSTILL UNLISTED (need a price from Michael):');
  left.forEach((x:any)=>console.log(`  id${x.id} #${x.card_number} ${x.player} | ${x.parallel}\n       ${x.comp_note}`));
  console.log('\nWHOLE VAULT NOW:');
  const v:any = await sql`
    SELECT count(*) n, count(*) FILTER (WHERE status='listed') listed,
           sum(coalesce(asking_price_cents,0)) FILTER (WHERE status='listed') ask
    FROM baseball_cards WHERE coalesce(sold_price_cents,0)=0`;
  console.log(`  ${v[0].n} unsold, ${v[0].listed} listed, $${(v[0].ask/100).toFixed(2)} in asks`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
