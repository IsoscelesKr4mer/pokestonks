import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  for (const ci of [17232, 17249]) {
    const [c]:any = await sql`SELECT name, last_market_cents m FROM catalog_items WHERE id=${ci}`;
    const [p]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM purchases WHERE catalog_item_id=${ci} AND deleted_at IS NULL`;
    const ids:any = await sql`SELECT id FROM purchases WHERE catalog_item_id=${ci} AND deleted_at IS NULL`;
    const pid = ids.map((x:any)=>x.id);
    const [s]:any = pid.length ? await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM sales WHERE purchase_id = ANY(${pid})` : [{q:0}];
    const [r]:any = pid.length ? await sql`SELECT COUNT(*)::int n FROM rips WHERE source_purchase_id = ANY(${pid})` : [{n:0}];
    const [d]:any = pid.length ? await sql`SELECT COUNT(*)::int n FROM box_decompositions WHERE source_purchase_id = ANY(${pid})` : [{n:0}];
    const held = p.q - s.q - r.n - d.n;
    console.log(`ci${ci} ${c.name}`);
    console.log(`   purchased ${p.q}  sold ${s.q}  ripped ${r.n}  decomp ${d.n}  ->  HELD ${held}   market $${(c.m/100).toFixed(2)} ea = $${(held*c.m/100).toFixed(2)}`);
  }
  console.log('\nNOTE: the 12 packs from the auction are not yet booked as a sale.');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
