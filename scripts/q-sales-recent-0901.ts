import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const s:any = await sql`SELECT sale_date::text d, count(*) rows, count(DISTINCT sale_group_id) grp,
    sum(sale_price_cents) gross FROM sales GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
  console.log('pokestonks sales by date:');
  s.forEach((r:any)=>console.log(`  ${r.d}  ${String(r.rows).padStart(3)} rows / ${r.grp} orders  $${(r.gross/100).toFixed(2)}`));
  const c:any = await sql`SELECT count(*) n, max(sold_date)::text last FROM baseball_cards WHERE coalesce(sold_price_cents,0)>0`;
  console.log(`\nbaseball_cards marked sold: ${c[0].n}, most recent ${c[0].last}`);
  await sql.end();
})();
