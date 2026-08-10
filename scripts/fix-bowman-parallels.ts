import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const upd:[number,string][]=[[129,'Mojo Refractor'],[130,'Shimmer Refractor'],[132,'Mojo Refractor'],[134,'Laser Refractor']];
  for(const [id,par] of upd) await sql`UPDATE baseball_cards SET parallel=${par}, notes=NULL WHERE id=${id}`;
  const r=await sql`SELECT id,player,card_number,parallel FROM baseball_cards WHERE id=ANY(${upd.map(u=>u[0])}) ORDER BY id`;
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number} -> ${x.parallel}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
