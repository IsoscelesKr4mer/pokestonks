import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  for(const t of ['rips','box_decompositions']){
    const c:any = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=${t} ORDER BY ordinal_position`;
    console.log(`${t}: ${c.map((x:any)=>x.column_name).join(', ')}`);
    const [n]:any = await sql.unsafe(`SELECT COUNT(*)::int n FROM ${t}`);
    console.log(`  rows: ${n.n}`);
    const s:any = await sql.unsafe(`SELECT * FROM ${t} ORDER BY 1 DESC LIMIT 2`);
    s.forEach((x:any)=>console.log('   ', JSON.stringify(x).slice(0,300)));
  }
  console.log('\n--- what ripping has cost him: box cost consumed by rips ---');
  const r:any = await sql`
    SELECT ci.name, COUNT(*)::int rips, SUM(p.cost_cents)::int cost
    FROM rips r JOIN purchases p ON p.id=r.source_purchase_id JOIN catalog_items ci ON ci.id=p.catalog_item_id
    GROUP BY ci.name ORDER BY cost DESC LIMIT 10`;
  let tot=0; r.forEach((x:any)=>{tot+=x.cost; console.log(`  ${String(x.rips).padStart(3)}x ${x.name.padEnd(46)} $${(x.cost/100).toFixed(2)}`);});
  const [all]:any = await sql`
    SELECT COUNT(*)::int n, SUM(p.cost_cents)::int cost FROM rips r JOIN purchases p ON p.id=r.source_purchase_id`;
  console.log(`  TOTAL ${all.n} rips, box cost $${(all.cost/100).toFixed(2)}`);
  console.log('\n--- do baseball_cards link back to a rip? ---');
  const cols:any = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='baseball_cards' AND column_name ILIKE '%rip%' OR (table_name='baseball_cards' AND column_name ILIKE '%source%')`;
  console.log(cols.length ? cols.map((x:any)=>x.column_name).join(', ') : '  NO link column — cards do not reference the box they came from');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
