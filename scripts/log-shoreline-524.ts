import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const dr=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES (${UID},17236,'2026-07-24',3,449,'Vending Machine','Shoreline Safeway ~5:30pm - 3 DR packs @ $4.49; machine loaded but mostly skip-tier (Pitch Black/AH/DR bundle/PO bundle all sold out)') RETURNING id`;
  const jt=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES (${UID},14342,'2026-07-24',1,2694,'Vending Machine','Shoreline Safeway ~5:30pm - Journey Together booster bundle @ $26.94') RETURNING id`;
  console.log('DR purchase id',dr[0].id,'| JT bundle id',jt[0].id);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
