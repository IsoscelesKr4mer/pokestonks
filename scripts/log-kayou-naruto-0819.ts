import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const ci = await sql`
    INSERT INTO catalog_items (kind, name, set_name, product_type, msrp_cents, pack_count, manual_market_cents, manual_market_at)
    VALUES ('sealed', 'Naruto Smriti Earth Scroll Collector Box (5 Packs)', 'Kayou Naruto: Earth Scroll', 'Collector Box', 999, 5, 1995, NOW())
    RETURNING id, name`;
  const id = Number(ci[0].id);
  console.log('CATALOG ITEM', ci[0]);
  const notes = 'Target, Edmonds WA, 2026-08-19. Shelf $9.99 each (tag KAYOU NARUTOERTHSCRL CLCTRBX, 361 01 0108, tagged 8/18). NO RECEIPT PHOTO YET: unit cost is $9.99 grossed up at the 10.7% effective WA rate from the 08-18 Safeway receipt = $11.06. Correct this lot if the actual receipt differs. Box back: model NR-KP-DZJLH-002-5P-NA, 7 cards per pack x 5 packs = 35 cards, 132 types, production date 07/06/2026, EAN 6937187418998. NOT in TCGCSV (90 categories, no Naruto/Kayou), so manual_market_cents is seeded at the $19.95 Walmart/Amazon retail list, which is a retail anchor and NOT a traded market price.';
  const p = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, ${id}, '2026-08-19', 2, 1106, 'Target', 'Edmonds, WA', ${notes})
    RETURNING id, quantity, cost_cents`;
  console.log('PURCHASE', p[0]);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
