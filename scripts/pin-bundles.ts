import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const pins:[number,number,string][]=[[53860,4000,'Pitch Black'],[31604,7300,'White Flare'],[17235,7200,'Destined Rivals'],[14342,4800,'Journey Together']];
  for(const [ci,cents,name] of pins){
    await sql`UPDATE catalog_items SET manual_market_cents=${cents}, manual_market_at=NOW() WHERE id=${ci}`;
    console.log(`${name} pinned $${(cents/100).toFixed(2)}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
