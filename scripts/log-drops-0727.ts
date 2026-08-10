import { config } from 'dotenv'; import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
(async()=>{
  const pb=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},53862,'2026-07-26',1,500,'Vending Machine',${'Edmonds Safeway ~:07 (NEW mark, was :28/:58) - PB booster pack popped on the way out after :48 and :58 misses; bought'}) RETURNING id`;
  const dr=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},17236,'2026-07-27',1,500,'Vending Machine',${'Shoreline Fred Meyer ~1:54pm (NEW ~:54 mark, was :15/:45) - bought DR single from a multi-drop (PB bundle/JT single/CR single also on screen, left them)'}) RETURNING id`;
  console.log('purchases inserted: PB pack lot',pb[0].id,'| DR single lot',dr[0].id);
  const rows=[
    '2026-07-27,Monday,13:51,Shoreline Fred Meyer,miss,,,,checked ~:51 - nothing (arrived early)',
    '2026-07-27,Monday,13:54,Shoreline Fred Meyer,hit,Destined Rivals Booster Pack,1,5.00,NEW ~:54 mark (was :15/:45); multi-drop - bought DR single',
    '2026-07-27,Monday,13:54,Shoreline Fred Meyer,seen,Pitch Black Booster Bundle,0,,on screen in the :54 multi-drop - left (skip-tier)',
    '2026-07-27,Monday,13:54,Shoreline Fred Meyer,seen,Journey Together Booster Pack,0,,on screen in the :54 multi-drop - left',
    '2026-07-27,Monday,13:54,Shoreline Fred Meyer,seen,Chaos Rising Booster Pack,0,,on screen in the :54 multi-drop - left',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('appended',rows.length,'FM drop rows');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
