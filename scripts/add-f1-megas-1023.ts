/**
 * 8x 2026 Topps Chrome Formula 1 Mega Box, Target Northgate, 2026-10-23.
 *
 * First Formula 1 product in the vault. Same integration shape as the other
 * sports sealed lines (see add-baseball-sealed-to-vault.ts): TCGCSV has no
 * motorsport category, so tcgplayer_product_id stays NULL, which is exactly
 * what keeps the row out of the daily Pokemon snapshot cron. It prices from
 * manual_market_cents instead.
 *
 * Cost: he reported "$69.99 a pop", which is the Target shelf price, pre-tax.
 * Northgate is Seattle: 10.55% per three published 2026 rate tables, and
 * 10.5458% measured off his own 2026-08-05 Dick's Northgate register receipt.
 * Both land on the same cents, so the per-box tax-in figure is not sensitive
 * to which one is used:
 *     8 x $69.99 = $559.92 + $59.05 tax = $618.97  ->  $77.37/box
 *
 *   npx tsx scripts/add-f1-megas-1023.ts           # dry run
 *   npx tsx scripts/add-f1-megas-1023.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

const NAME = '2026 Topps Chrome Formula 1 Mega Box';
const SET_NAME = '2026 Topps Chrome Formula 1';
const PRODUCT_TYPE = 'Mega Box';
const RELEASE_DATE = '2026-10-15';

const LOT = {
  date: '2026-10-23',
  qty: 8,
  costCents: 7737,
  source: 'Target',
  location: 'Seattle Northgate',
  notes:
    'Bought for resale on eBay. 8 boxes at $69.99 shelf = $559.92 + 10.55% Seattle tax $59.05 = $618.97 paid, $77.37/box. ' +
    'Box UPC 887521162826 (PKG018290), 6 packs per box / 7 cards per pack / 42 cards. Covers F1, F2, F3 and F1 Academy. ' +
    'Mega-exclusive parallels: Flag Refractor and Checker Flag Refractor. Chase is Chrome Autograph cards.',
};

async function main() {
  const [existing] = await sql<{ id: number }[]>`
    SELECT id FROM catalog_items WHERE name = ${NAME} LIMIT 1`;

  console.log(`${NAME}`);
  console.log(
    `   ${LOT.qty} boxes @ $${(LOT.costCents / 100).toFixed(2)} = ` +
      `$${((LOT.qty * LOT.costCents) / 100).toFixed(2)}` +
      (existing ? `  [catalog row already exists as ci${existing.id}]` : '  [new catalog row]')
  );

  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    await sql.end();
    return;
  }

  let catalogId = existing?.id;
  if (!catalogId) {
    const [ci] = await sql<{ id: number }[]>`
      INSERT INTO catalog_items (kind, name, set_name, product_type, release_date, tcgplayer_product_id)
      VALUES ('sealed', ${NAME}, ${SET_NAME}, ${PRODUCT_TYPE}, ${RELEASE_DATE}, NULL)
      RETURNING id`;
    catalogId = ci.id;
    console.log(`   catalog #${catalogId} created`);
  }

  const [p] = await sql<{ id: number }[]>`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, ${catalogId}, ${LOT.date}, ${LOT.qty}, ${LOT.costCents}, ${LOT.source}, ${LOT.location}, ${LOT.notes})
    RETURNING id`;
  console.log(`   lot #${p.id}: ${LOT.date} qty ${LOT.qty} @ $${(LOT.costCents / 100).toFixed(2)}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
