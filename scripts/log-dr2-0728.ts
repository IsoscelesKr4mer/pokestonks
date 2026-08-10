import { config } from 'dotenv'; import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
(async()=>{
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},17236,'2026-07-28',2,502,'Vending Machine',${'Edmonds Safeway ~10:05am - 2 DR packs sitting right after a fresh restock (clerk closed door, they were sitting); bought both @ $5.02 ea ($10.04 total). Nothing pulled after; :07 then dead. Restock may have shifted timing - TBD'}) RETURNING id`;
  console.log('DR 2-pack purchase lot:',r[0].id);
  const rows=[
    '2026-07-28,Tuesday,10:05,Edmonds Safeway,hit,Destined Rivals Booster Pack,2,5.02,2 sitting right after a fresh restock (clerk closed door); bought both; nothing pulled after',
    '2026-07-28,Tuesday,10:07,Edmonds Safeway,miss,,,,waited for :07 - nothing; buying the sitting DR at ~:05 likely already pulled it, OR restock shifted the timing (TBD)',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('appended',rows.length,'rows');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
