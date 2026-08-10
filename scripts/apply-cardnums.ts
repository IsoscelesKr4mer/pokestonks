import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const upd=[[63,'BTP-1'],[68,'FS-8'],[72,'91CB-22']] as [number,string][];
  for(const [id,num] of upd){ await sql`UPDATE baseball_cards SET card_number=${num} WHERE id=${id} AND card_number IS NULL`; }
  const rows=await sql`SELECT id,player,card_number FROM baseball_cards WHERE id = ANY(${upd.map(u=>u[0])}) ORDER BY id`;
  for(const r of rows) console.log(`id${r.id} ${r.player} -> #${r.card_number}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
