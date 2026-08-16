/**
 * Log 2x 2025-26 Bowman Basketball Mega Box, 2026-08-10.
 *
 *   npx tsx scripts/log-bowman-basketball-mega.ts          # dry run
 *   npx tsx scripts/log-bowman-basketball-mega.ts --write
 *
 * $59.99 shelf price is READ OFF THE SHELF TAG in Michael's photo, so it is
 * not an estimate. The TAX RATE IS INFERRED: 10.5%, the confirmed Fred Meyer
 * Shoreline rate from receipt 08/10/26 (purchase 548) and purchase 509. That
 * gives $66.29/box.
 *
 * If the store or the rate is different, fix cost_cents on this lot AND
 * anything downstream that quoted $66.29. Michael has been asked to confirm.
 *
 * Not in TCGCSV (TCGplayer does not carry sports sealed), so the catalog row
 * is hand-made the same way ci135078/ci135079 were.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

const NAME = '2025-26 Bowman Basketball Mega Box';
const SET_NAME = '2025-26 Bowman Basketball';

// Active-listing scan 2026-08-10 (scripts/comp-scan.ts, n=159): genuine single
// sealed megas floor at $75-79, body $85-$120, median $99.97 delivered.
// Active asks sit above real solds, so mark conservatively under the median
// and revisit once an actual sold comp exists.
const MARKET_CENTS = 9499;

const QTY = 2;
const SHELF_CENTS = 5999;
const TAX_RATE = 0.105;
const UNIT_COST_CENTS = Math.round(SHELF_CENTS * (1 + TAX_RATE)); // 6629
const PURCHASE_DATE = '2026-08-10';
const NOTES =
  '2x at $59.99 shelf. TAX RATE INFERRED at 10.5% (Fred Meyer Shoreline rate confirmed on receipt 08/10/26, lot 548) => $66.29/box, $132.58 total. CONFIRM AGAINST RECEIPT: if the store or rate differs, correct cost_cents here. Bought after a comp scan showed sealed megas at a $75-79 floor, $85-120 body, $99.97 median delivered across 159 active listings; break-even ask is $78.25.';

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

async function main() {
  let [item]: any = await sql`select id, name from catalog_items where name = ${NAME}`;
  if (!item) {
    console.log(`catalog: "${NAME}" not present, will create`);
    if (WRITE) {
      [item] = await sql`
        insert into catalog_items (kind, name, set_name, product_type, manual_market_cents, manual_market_at)
        values ('sealed', ${NAME}, ${SET_NAME}, 'Mega Box', ${MARKET_CENTS}, now())
        returning id, name`;
      console.log(`catalog item ${item.id} created`);
    }
  } else {
    console.log(`catalog: found #${item.id} ${item.name}`);
  }

  const spend = QTY * UNIT_COST_CENTS;
  const value = QTY * MARKET_CENTS;
  const breakEven = (UNIT_COST_CENTS / 100 + 0.4 + 9 * 0.1325) / (1 - 0.1325);
  console.log(`\n${QTY}x ${NAME}`);
  console.log(`  shelf  $${(SHELF_CENTS / 100).toFixed(2)} + ${(TAX_RATE * 100).toFixed(1)}% tax = $${(UNIT_COST_CENTS / 100).toFixed(2)}/box  (tax rate INFERRED)`);
  console.log(`  spend  $${(spend / 100).toFixed(2)}`);
  console.log(`  mark   $${(MARKET_CENTS / 100).toFixed(2)}/box, $${(value / 100).toFixed(2)} total`);
  console.log(`  unrealized $${((value - spend) / 100).toFixed(2)} (${(((value - spend) / spend) * 100).toFixed(0)}%)`);
  console.log(`  break-even ask $${breakEven.toFixed(2)}, market floor $75-79 -- thin cushion`);

  if (!WRITE) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  const [p] = await sql`
    insert into purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    values (${USER}, ${item.id}, ${PURCHASE_DATE}, ${QTY}, ${UNIT_COST_CENTS}, 'Fred Meyer', 'Shoreline', ${NOTES})
    returning id`;
  console.log(`\npurchase ${p.id} logged (${QTY} @ $${(UNIT_COST_CENTS / 100).toFixed(2)})`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
