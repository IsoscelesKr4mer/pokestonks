import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,player,set_name,card_number,parallel FROM baseball_cards
    WHERE for_sale=true AND status NOT IN ('listed','sold') AND asking_price_cents IS NULL
    AND coalesce(notes,'') NOT ILIKE '%AUCTION%' ORDER BY id`;
  console.log(`${r.length} sellable cards with NO auto-price (need hand-pricing):`);
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number??'?'} | ${x.set_name} | ${x.parallel}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
