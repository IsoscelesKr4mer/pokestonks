import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT name, last_market_cents, last_market_at, manual_market_cents
    FROM catalog_items WHERE product_type='Booster Bundle'
    AND name ILIKE ANY(ARRAY['%prismatic evolutions booster bundle','%white flare booster bundle','%pitch black booster bundle','%destined rivals booster bundle','%journey together booster bundle'])
    ORDER BY name`;
  for(const x of r) console.log(`${x.name.replace(' Booster Bundle','')}: $${(x.last_market_cents/100).toFixed(2)} @ ${String(x.last_market_at).slice(0,16)} ${x.manual_market_cents?'(manual $'+(x.manual_market_cents/100).toFixed(2)+')':''}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
