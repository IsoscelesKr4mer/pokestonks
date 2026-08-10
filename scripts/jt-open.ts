import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  for(const id of [49,281]){
    const rip=(await sql`SELECT COUNT(*)::int c FROM rips WHERE source_purchase_id=${id}`)[0].c;
    const dec=(await sql`SELECT COUNT(*)::int c FROM box_decompositions WHERE source_purchase_id=${id}`)[0].c;
    const sold=(await sql`SELECT COALESCE(SUM(quantity),0)::int s FROM sales WHERE purchase_id=${id}`)[0].s;
    console.log(`lot${id}: qty1 - sold${sold} - rip${rip} - decomp${dec} = held ${1-sold-rip-dec}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
