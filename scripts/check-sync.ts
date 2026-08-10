import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const t=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%sync%' OR table_name ILIKE '%dedup%' OR table_name ILIKE '%ebay%')`;
  console.log('tables:', t.map((x:any)=>x.table_name).join(', '));
  const s=await sql`SELECT id,purchase_id,sale_date::text,quantity,sale_price_cents,fees_cents,platform,sale_group_id FROM sales WHERE platform ILIKE '%ebay%' ORDER BY id DESC LIMIT 5`;
  console.log('recent eBay sales:');
  for(const x of s) console.log(' ',JSON.stringify(x));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
