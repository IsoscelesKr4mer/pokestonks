import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r=await sql`SELECT sale_date::text AS d, COUNT(*) n, SUM(sale_price_cents) rev FROM sales WHERE platform ILIKE '%card show%' GROUP BY sale_date::text ORDER BY d`;
  for(const x of r) console.log(`${x.d}: ${x.n} rows, $${(Number(x.rev)/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
