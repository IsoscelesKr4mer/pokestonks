import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const CI=135082;
  const p:any = await sql`SELECT id, purchase_date::text d, quantity q, cost_cents c FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL ORDER BY id`;
  for(const x of p){
    const [r]:any = await sql`SELECT COUNT(*)::int n FROM rips WHERE source_purchase_id=${x.id}`;
    console.log(`purchase ${x.id}: ${x.d} qty ${x.q} @ $${(x.c/100).toFixed(2)}  -- ${r.n} rips logged`);
  }
  const s:any = await sql`SELECT id, sale_date::text d, quantity q FROM sales WHERE source_purchase_id = ANY(${p.map((x:any)=>x.id)}) AND deleted_at IS NULL`;
  console.log(`sales against these lots: ${s.length}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
