// Adds the One Piece Card Game Illustration Box Vol. 7 (Rayleigh/Shakuyaku) to
// the vault and logs the 4 boxes bought at Fred Meyer on 2026-08-03.
//
// TCGCSV: category 68 (One Piece Card Game), group 17675 "One Piece Promotion
// Cards", abbreviation OP-PR, product 694721. Category 68 was added to
// SNAPSHOT_CATEGORY_IDS in lib/services/price-snapshots.ts so the daily cron
// picks this up on set_code OP-PR.
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

// $23.99 shelf + 10.7% Fred Meyer tax (rate taken from the 2026-08-01 Finest
// receipt: 37.44 / 349.95). 4 x 23.99 = 95.96 + 10.27 tax = 106.23 -> 26.56 ea.
const UNIT_COST_CENTS = 2656;
const QTY = 4;

async function main() {
  const [item] = await sql`
    INSERT INTO catalog_items (kind, name, set_name, set_code, tcgplayer_product_id, product_type,
                               image_url, release_date, last_market_cents, last_market_at)
    VALUES ('sealed', 'One Piece Card Game Illustration Box Vol. 7', 'One Piece Promotion Cards', 'OP-PR',
            694721, 'Illustration Box',
            'https://tcgplayer-cdn.tcgplayer.com/product/694721_200w.jpg', '2026-07-31', 4480, NOW())
    ON CONFLICT (tcgplayer_product_id) DO UPDATE SET name = excluded.name
    RETURNING id, name, set_code, last_market_cents`;
  console.log(`catalog #${item.id} ${item.name} [${item.set_code}] market $${(item.last_market_cents / 100).toFixed(2)}`);

  const existing = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM purchases
    WHERE catalog_item_id = ${item.id} AND deleted_at IS NULL`;
  if (existing[0].n > 0) {
    console.log(`already has ${existing[0].n} lot(s); skipping purchase insert`);
    await sql.end();
    return;
  }

  const [buy] = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, ${item.id}, '2026-08-03', ${QTY}, ${UNIT_COST_CENTS}, 'Fred Meyer', 'Shoreline',
      'Vol. 7 Rayleigh/Shakuyaku at launch. $23.99 shelf + 10.7% tax = $26.56/box, confirmed by Michael 2026-08-04.')
    RETURNING id, quantity, cost_cents`;
  console.log(`purchase #${buy.id} qty ${buy.quantity} @ $${(buy.cost_cents / 100).toFixed(2)} = $${(buy.quantity * buy.cost_cents / 100).toFixed(2)}`);

  const [snap] = await sql`
    INSERT INTO market_prices (catalog_item_id, snapshot_date, condition, market_price_cents, low_price_cents, high_price_cents, source)
    VALUES (${item.id}, CURRENT_DATE, NULL, 4480, 4197, 20000, 'tcgcsv')
    ON CONFLICT (catalog_item_id, snapshot_date, condition, source) DO UPDATE
      SET market_price_cents = excluded.market_price_cents
    RETURNING id, market_price_cents`;
  console.log(`snapshot #${snap.id} $${(snap.market_price_cents / 100).toFixed(2)}`);

  const cost = QTY * UNIT_COST_CENTS;
  const value = QTY * 4480;
  console.log(`\ncost basis $${(cost / 100).toFixed(2)}  market value $${(value / 100).toFixed(2)}  unrealized +$${((value - cost) / 100).toFixed(2)} (${(((value - cost) / cost) * 100).toFixed(1)}%)`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
