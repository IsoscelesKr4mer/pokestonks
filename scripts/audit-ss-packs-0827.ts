/**
 * Full audit of Surging Sparks Booster Packs (ci19928). Michael says he has more
 * than 8 -- he is right, my "8" was the LIMIT 8 on a display query, not a count.
 * Held = purchases - rips - decompositions - sales.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const CI = 19928;
(async()=>{
  const t:any = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`;
  console.log('tables: '+t.map((x:any)=>x.table_name).join(', ')+'\n');

  const p:any = await sql`SELECT id, purchase_date::text d, quantity q, cost_cents c, source, notes
    FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL ORDER BY purchase_date, id`;
  const tot = p.reduce((a:number,x:any)=>a+x.q,0);
  console.log(`=== ${p.length} purchase LOTS, ${tot} packs total ===`);
  const byPrice = new Map<number,number>();
  for(const x of p) byPrice.set(x.c,(byPrice.get(x.c)||0)+x.q);
  console.log('distinct unit costs:');
  for(const [c,q] of [...byPrice].sort((a,b)=>a[0]-b[0])) console.log(`   $${(c/100).toFixed(2)} x ${q} packs`);
  console.log('\nlots:');
  for(const x of p) console.log(`  pu${String(x.id).padEnd(4)} ${x.d} qty ${String(x.q).padStart(3)} @ $${(x.c/100).toFixed(2)}  ${String(x.source??'').slice(0,22).padEnd(22)} ${String(x.notes??'').slice(0,60)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
