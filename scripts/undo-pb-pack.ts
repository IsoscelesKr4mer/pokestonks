import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r=await sql`UPDATE purchases SET deleted_at=now(), notes=${'VOID: mis-logged from voice transcription - Michael did NOT buy this Pitch Black pack, only saw it at Edmonds Safeway :07 (PB is skip-tier, he never buys it). Confirms the :07 mark only.'} WHERE id=500 AND deleted_at IS NULL RETURNING id,catalog_item_id`;
  console.log('soft-deleted phantom PB pack lot:',JSON.stringify(r));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
