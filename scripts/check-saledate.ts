import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const t=await sql`SELECT data_type FROM information_schema.columns WHERE table_name='sales' AND column_name='sale_date'`;
  console.log('sale_date type:', t[0].data_type);
  const r=await sql`SELECT id, sale_date, sale_date::text AS as_text FROM sales WHERE sale_group_id='662559a7-676a-4e37-a5f7-6eca0f1bc6c5'`;
  for(const x of r) console.log(JSON.stringify(x));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
