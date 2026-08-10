import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`UPDATE baseball_cards SET parallel='Baseball Seams Refractor',
      notes=NULLIF(btrim(replace(replace(coalesce(notes,''),'CONFIRM PARALLEL (cataloguer unsure)',''),'| |','|'),' |'),'')
    WHERE parallel ILIKE '%raywave / colored%' AND parallel ILIKE '%CONFIRM%' RETURNING id,player,card_number,notes`;
  console.log('new seams cards updated:'); r.forEach(x=>console.log(`  id${x.id} ${x.player} #${x.card_number} | notes: ${x.notes??'-'}`));
  await sql`UPDATE baseball_cards SET parallel='Baseball Seams Refractor' WHERE id=65`;
  console.log('id65 Pasquantino -> Baseball Seams Refractor');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
