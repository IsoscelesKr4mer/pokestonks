import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
async function main() {
  const notes = 'Edmonds Safeway 13:05, OFF-MARK. He tapped 12:40 and got nothing, came back at 13:05 aiming for the :10 and found THREE packs already sitting in the machine, so a drop landed somewhere in the 12:41-13:04 window. Bought one Destined Rivals pack; the purchase itself appeared to pull the next drop in. Two other packs left, not identified. Standard $5.00 vending single.';
  const r = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-21', 1, 500, 'Vending Machine', 'Edmonds, WA', ${notes})
    RETURNING id`;
  console.log('DR pack lot#', r[0].id);
  const h: any = await sql`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales sa WHERE sa.purchase_id=p.id),0)),0)::int h
    FROM purchases p WHERE p.catalog_item_id=17236 AND p.deleted_at IS NULL`;
  console.log('Loose DR held now:', h[0].h);
  await sql.end();
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
