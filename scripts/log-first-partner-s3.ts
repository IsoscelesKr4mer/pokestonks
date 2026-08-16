/**
 * Log 2x First Partner Illustration Collection (Series 3), Fred Meyer
 * Shoreline, 2026-08-10.
 *
 *   npx tsx scripts/log-first-partner-s3.ts          # dry run
 *   npx tsx scripts/log-first-partner-s3.ts --write
 *
 * Straight off the receipt photo, no estimating:
 *   Fred Meyer, 18325 Aurora Ave North, Shoreline WA 98133
 *   08/10/26 16:20
 *   2 x TRADE CARD @ 17.99 = 35.98, TAX 3.78, TOTAL 39.76
 *   => 39.76 / 2 = $19.88 per unit tax-in, a 10.5% rate, matching the other
 *      Shoreline FM receipts on file (purchase 509).
 *
 * Series 3 was not in catalog_items (only Series 1 and 2 were), so this also
 * creates it from TCGCSV group 24584, productId 695400.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

const TCG_PRODUCT_ID = 695400;
const NAME = 'First Partner Illustration Collection (Series 3)';
const SET_NAME = 'First Partner Collection 2026';
const MARKET_CENTS = 3719; // TCGCSV market 2026-08-10

const QTY = 2;
const UNIT_COST_CENTS = 1988;
const PURCHASE_DATE = '2026-08-10';
const NOTES =
  'Fred Meyer Shoreline (18325 Aurora Ave N), receipt 08/10/26 16:20 - 2x TRADE CARD @ $17.99 = $35.98 subtotal + $3.78 tax (10.5%) = $39.76 total, $19.88/unit tax-in. Retail shelf, not the vending machine.';

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

async function main() {
  let [item]: any = await sql`select id, name, last_market_cents from catalog_items where tcgplayer_product_id = ${String(TCG_PRODUCT_ID)}`;

  if (!item) {
    console.log(`catalog: "${NAME}" not present, will create from TCGCSV ${TCG_PRODUCT_ID}`);
    if (WRITE) {
      [item] = await sql`
        insert into catalog_items (kind, name, set_name, tcgplayer_product_id, product_type,
                                   image_url, release_date, last_market_cents, last_market_at)
        values ('sealed', ${NAME}, ${SET_NAME}, ${String(TCG_PRODUCT_ID)}, 'Collection',
                ${`https://tcgplayer-cdn.tcgplayer.com/product/${TCG_PRODUCT_ID}_200w.jpg`},
                '2026-03-30', ${MARKET_CENTS}, now())
        returning id, name, last_market_cents`;
      console.log(`catalog item ${item.id} created`);
    }
  } else {
    console.log(`catalog: found #${item.id} ${item.name}`);
    if (WRITE) {
      await sql`update catalog_items set last_market_cents=${MARKET_CENTS}, last_market_at=now() where id=${item.id}`;
    }
  }

  const spend = QTY * UNIT_COST_CENTS;
  const value = QTY * MARKET_CENTS;
  console.log(`\n${QTY}x ${NAME}`);
  console.log(`  cost   $${(UNIT_COST_CENTS / 100).toFixed(2)}/ea, $${(spend / 100).toFixed(2)} total`);
  console.log(`  market $${(MARKET_CENTS / 100).toFixed(2)}/ea (TCGCSV), $${(value / 100).toFixed(2)} total`);
  console.log(`  unrealized $${((value - spend) / 100).toFixed(2)} (${(((value - spend) / spend) * 100).toFixed(0)}%)`);

  if (!WRITE) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const [p] = await sql`
    insert into purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    values (${USER}, ${item.id}, ${PURCHASE_DATE}, ${QTY}, ${UNIT_COST_CENTS}, 'Fred Meyer', 'Shoreline', ${NOTES})
    returning id`;
  console.log(`\npurchase ${p.id} logged`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
