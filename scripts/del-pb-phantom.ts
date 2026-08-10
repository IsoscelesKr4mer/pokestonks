import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const chk=await sql`SELECT COALESCE(SUM(quantity),0)::int s FROM sales WHERE purchase_id=493`;
  if(chk[0].s>0){ console.log('ABORT: lot493 has sales, not safe to delete'); await sql.end(); return; }
  await sql`UPDATE purchases SET deleted_at=NOW(), notes=concat(coalesce(notes,''),' [SOFT-DELETED: mis-logged from voice note - was NOT a PB bundle; Michael has only 4 PB bundles, all Pokemon Center presale]') WHERE id=493`;
  const r=await sql`SELECT id,deleted_at IS NOT NULL del FROM purchases WHERE id=493`;
  console.log('lot493 deleted:',r[0].del);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
