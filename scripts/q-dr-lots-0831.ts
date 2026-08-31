import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const p:any = await sql`SELECT id, purchase_date::text d, quantity q, cost_cents c FROM purchases
    WHERE catalog_item_id=17232 AND deleted_at IS NULL ORDER BY purchase_date, id`;
  console.log('DR sleeved pack lots (FIFO order):');
  let open=0;
  for(const x of p){
    const [s]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM sales WHERE purchase_id=${x.id}`;
    const rem = x.q - s.q;
    open += rem;
    if(rem>0) console.log(`  pu${String(x.id).padEnd(4)} ${x.d} qty ${String(x.q).padStart(2)} @ $${(x.c/100).toFixed(2)}  sold ${s.q}  open ${rem}`);
  }
  console.log(`  total open: ${open}`);
  console.log('\nexisting sale row shape:');
  const ex:any = await sql`SELECT * FROM sales ORDER BY id DESC LIMIT 1`;
  console.log(' ', JSON.stringify(ex[0]).slice(0,320));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
