import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const dupe = await sql`SELECT id, purchase_date::text d, cost_cents, source FROM purchases
    WHERE catalog_item_id=76 AND purchase_date='2026-09-05' AND deleted_at IS NULL`;
  if (dupe.length) { console.log('ALREADY LOGGED:', dupe); await sql.end(); return; }
  const r = await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, condition, source, location, notes)
    VALUES (${USER}, 76, '2026-09-05', 1, 2900, 'sealed', 'Private sale', 'Edmonds, WA',
      ${'Bought off a friend from the vending machine scene, not a machine pull. He charged $29 flat (no tax), $1 under the standard $30 vending bundle price. Reported via Discord 2026-09-05.'})
    RETURNING id, purchase_date::text d, quantity, cost_cents, source`;
  console.log('LOGGED:', r[0]);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
