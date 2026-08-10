/**
 * Adds 2025-26 Topps Chrome Update Basketball sealed to the vault.
 * Same shape as the baseball sealed items: tcgplayer_product_id = NULL keeps
 * them out of the Pokemon cron; they price from SportsCardsPro instead.
 *
 *   npx tsx scripts/add-basketball-sealed-to-vault.ts           # dry run
 *   npx tsx scripts/add-basketball-sealed-to-vault.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

// Dick's Northgate, 8/6/2026 10:13 AM, store 1419 trans 1600. A $20 reward
// certificate was spread across the four items (-3.46 x2 value, -6.54 x2 mega),
// so the post-credit line prices are 41.54 and 78.46. Tax 10.55% on the $240
// subtotal = $25.32, total $265.32. Per-box all-in below reconciles exactly.
const ITEMS = [
  {
    name: '2025-26 Topps Chrome Update Basketball Mega Box',
    productType: 'Mega Box',
    qty: 2,
    costCents: 8674, // 78.46 x 1.10546
    // Seeded from the individual eBay sold rows, NOT SportsCardsPro's computed
    // number. See the note in refresh-sportscardspro.ts about the blended page.
    marketCents: 12500,
    notes: 'Release day. $85.00 list, less a $6.54 share of the $20 reward certificate = $78.46 + 10.55% tax = $86.74/box. Purchase limit 2. Reward earned from the Topps Chrome baseball buys the day before.',
  },
  {
    name: '2025-26 Topps Chrome Update Basketball Value Box',
    productType: 'Value Box',
    qty: 2,
    costCents: 4592, // 41.54 x 1.10546
    marketCents: null, // no clean Update-specific comp yet, do not invent one
    notes: 'Release day. $45.00 list, less a $3.46 share of the $20 reward certificate = $41.54 + 10.55% tax = $45.92/box. Purchase limit 2.',
  },
];

async function main() {
  let total = 0;
  for (const it of ITEMS) {
    const [existing] = await sql<{ id: number }[]>`
      SELECT id FROM catalog_items WHERE name = ${it.name} LIMIT 1`;
    total += it.qty * it.costCents;
    console.log(`${it.name}`);
    console.log(`   qty ${it.qty} @ $${(it.costCents / 100).toFixed(2)} = $${(it.qty * it.costCents / 100).toFixed(2)}` +
      `  market ${it.marketCents ? '$' + (it.marketCents / 100).toFixed(2) : 'UNKNOWN'}` +
      (existing ? `  [exists as ci${existing.id}]` : ''));
    if (!APPLY || existing) continue;

    const [ci] = await sql<{ id: number }[]>`
      INSERT INTO catalog_items (kind, name, set_name, product_type, release_date, tcgplayer_product_id, manual_market_cents, manual_market_at)
      VALUES ('sealed', ${it.name}, '2025-26 Topps Chrome Update', ${it.productType}, '2026-08-06', NULL,
              ${it.marketCents}, ${it.marketCents ? sql`NOW()` : null})
      RETURNING id`;
    const [p] = await sql<{ id: number }[]>`
      INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
      VALUES (${UID}, ${ci.id}, '2026-08-06', ${it.qty}, ${it.costCents}, 'Dick''s Sporting Goods', 'Seattle Northgate', ${it.notes})
      RETURNING id`;
    console.log(`   catalog #${ci.id}, lot #${p.id}`);
  }
  console.log(`\nreceipt total $265.32 | computed $${(total / 100).toFixed(2)}`);
  if (!APPLY) console.log('\ndry run - pass --apply to write');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
