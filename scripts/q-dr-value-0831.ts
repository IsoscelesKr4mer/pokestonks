import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const c:any=await sql`SELECT id,name,last_market_cents,last_market_at::text at FROM catalog_items
    WHERE name ILIKE '%destined rivals%' AND (name ILIKE '%sleeved%pack%' OR name ILIKE '%booster pack%')
    ORDER BY id`;
  for(const x of c) console.log(`ci${x.id}  ${x.name.padEnd(52)} $${x.last_market_cents?(x.last_market_cents/100).toFixed(2):'-'}  ${x.at??''}`);
  const m:any=await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE ebay_item_id='168632581778'`;
  console.log('\nmapping for the auction:', m.length?JSON.stringify(m[0].mappings):'NONE — sale will not book to the vault');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
