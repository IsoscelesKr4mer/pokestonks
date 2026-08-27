/**
 * Michael ripped all 6 Kayou Naruto Earth Scroll collector boxes on 2026-08-27.
 * One row per box (the rips table has no quantity column), so 2 against lot 580
 * and 4 against lot 584.
 *
 * realized_loss_cents stays 0, matching every other rip row. The $66.30 of box
 * cost does NOT vanish, it should follow the cards -- but Naruto singles have no
 * table to live in yet, so the basis is orphaned until the unified sales work
 * lands. Flagged rather than silently booked as a loss.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b', DATE='2026-08-27', COST=1105;
const LOTS=[{id:580,n:2},{id:584,n:4}];
const NOTE=`Ripped ${DATE}. Michael opened all 6 Earth Scroll collector boxes for singles and ended both sealed listings (168625893567 qty 4, 168627240754 twofer) the same day. Box cost $11.05 each; the resulting singles have no table yet, so this rip carries no realized loss and the $66.30 basis is unassigned.`;
(async()=>{
  const [before]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM purchases WHERE catalog_item_id=135082 AND deleted_at IS NULL`;
  const [had]:any = await sql`SELECT COUNT(*)::int n FROM rips WHERE source_purchase_id = ANY(${LOTS.map(l=>l.id)})`;
  console.log(`purchased ${before.q} boxes, ${had.n} rips already logged, adding ${LOTS.reduce((a,l)=>a+l.n,0)}`);
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  for(const l of LOTS) for(let i=0;i<l.n;i++)
    await sql`INSERT INTO rips (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
              VALUES (${UID}, ${l.id}, ${DATE}, ${COST}, 0, ${NOTE})`;
  const [after]:any = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(pack_cost_cents),0)::int c FROM rips WHERE source_purchase_id = ANY(${LOTS.map(l=>l.id)})`;
  console.log(`rips now ${after.n}, cost $${(after.c/100).toFixed(2)}`);
  console.log(`held qty: ${before.q} purchased - ${after.n} ripped = ${before.q-after.n}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
