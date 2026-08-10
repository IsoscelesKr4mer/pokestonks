import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const ids=[95,13,14,106,108,116,101];
  const r=await sql`UPDATE baseball_cards SET parallel='Mini Diamond Refractor (mega box)' WHERE id = ANY(${ids}) RETURNING id,player,card_number`;
  console.log(`relabeled ${r.length} -> Mini Diamond Refractor (mega box):`);
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
