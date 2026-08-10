import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GRPS=['71060ddd-6808-4209-bd3c-966b9f2de1fd','aa79d323-6ce9-4661-8774-c282f18978c9','662559a7-676a-4e37-a5f7-6eca0f1bc6c5'];
(async()=>{
  const r=await sql`UPDATE sales SET sale_date='2026-07-25' WHERE sale_group_id = ANY(${GRPS}) AND sale_date='2026-07-24' RETURNING id`;
  console.log('updated',r.length,'sale rows to 2026-07-25 (Saturday)');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
