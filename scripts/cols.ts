import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  for(const t of ['sales','rips','box_decompositions']){
    const c=await sql`SELECT column_name FROM information_schema.columns WHERE table_name=${t} ORDER BY ordinal_position`;
    console.log(t+':', c.map((x:any)=>x.column_name).join(', '));
  }
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
