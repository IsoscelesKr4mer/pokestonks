import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const dr=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES (${UID},17236,'2026-07-24',2,500,'Vending Machine',
    'Edmonds Safeway 1:23 - 2 DR packs sitting on arrival (early ~:23); bought both') RETURNING id`;
  const pb=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES (${UID},53860,'2026-07-24',1,3000,'Vending Machine',
    'Edmonds Safeway 1:28 - Pitch Black booster bundle; pulled the :28 drop early as trigger, bought. Machine bundle price assumed $30 (per AH precedent) - confirm') RETURNING id`;
  console.log('DR purchase id',dr[0].id,'| PB bundle purchase id',pb[0].id);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
