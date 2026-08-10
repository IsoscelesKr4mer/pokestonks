import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  await sql`ALTER TABLE baseball_cards ADD COLUMN IF NOT EXISTS hidden_from_share boolean NOT NULL DEFAULT false`;
  const r=await sql`UPDATE baseball_cards SET hidden_from_share=true WHERE player ILIKE '%kade anderson%' AND set_name ILIKE '%sapphire%' RETURNING id,player,parallel`;
  console.log('hidden from share:'); r.forEach(x=>console.log(`  id${x.id} ${x.player} [${x.parallel}]`));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
