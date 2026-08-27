/**
 * Surging Sparks booster pack, Edmonds Safeway, 2026-08-27 14:25 PDT.
 *
 * The transcript read "at $2.25", but that is the TIME, not a price. Three
 * things agree: the Discord message is stamped 21:25:47Z = 14:25 Pacific, :25
 * is one of the two Edmonds Safeway drop marks, and every one of the 8 prior
 * Surging Sparks packs he has bought was $5.00. A genuine $2.25 pack would be
 * a 55% break from an otherwise perfectly flat price. Logged at the standard
 * $5.00 and called out in the reply so he can correct it in one word.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b', CI=19928, DATE='2026-08-27', COST=500;
const NOTE='Edmonds Safeway 14:25 PDT, ON the :25 mark. Voice note transcribed as "at $2.25" but that is the time, not the price: the message is stamped 21:25:47Z = 14:25 Pacific, :25 is a scheduled drop mark, and all 8 prior Surging Sparks packs were $5.00. Standard $4.49 + WA tax = $5.00 vending single-pack price.';
(async()=>{
  const [c]:any = await sql`SELECT id, name FROM catalog_items WHERE id=${CI}`;
  console.log(`ci${c.id} ${c.name}  qty 1 @ $${(COST/100).toFixed(2)} on ${DATE}`);
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  const [r]:any = await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${UID}, ${CI}, ${DATE}, 1, ${COST}, 'Vending Machine', ${NOTE}) RETURNING id`;
  console.log(`logged purchase ${r.id}`);
  const [h]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  console.log(`Surging Sparks packs purchased lifetime: ${h.q}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
