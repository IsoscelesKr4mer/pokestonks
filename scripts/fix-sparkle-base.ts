import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`UPDATE baseball_cards SET parallel='base' WHERE parallel ILIKE 'Speckle/sparkle%' RETURNING id,player,card_number`;
  console.log(`set ${r.length} sparkle cards -> base:`);
  for(const x of r) console.log(`  id${x.id} ${x.player} #${x.card_number}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
