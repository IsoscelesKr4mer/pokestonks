/**
 * 6 MTG The Hobbit collector boosters from Target at MSRP.
 *
 *   npx tsx scripts/log-hobbit-collectors-0915.ts --apply
 *
 * Voice note: "I just bought six collectors boosters for the Hobbit MTG at
 * Target for MSRP. Crazy, right?" Then one receipt of the three trips.
 *
 * Receipt IMG_4284: Target Northgate, 09/15/2026 04:41 PM, DPCI 361014334
 * WzrdsOTCoast, 2 @ $44.99 = $89.98 + 10.55% WA tax $9.49 = $99.47. Three
 * identical transactions, so 6 packs for $298.41.
 *
 * $44.99 x 1.1055 = $49.74 a pack. Six of those is $298.44 against the real
 * $298.41, three cents of integer rounding from the register taxing the
 * subtotal rather than each item. Same shape as the Ascended Heroes tins
 * earlier today.
 *
 * He is right that it is a find: live single-pack asks run $65 to $80, median
 * about $75, against a $44.99 shelf. MTG is new ground for the vault, there
 * was no Hobbit row and no MTG purchase of any kind before this, so the
 * catalog item is created here.
 *
 * manual_market is set from the ASK median, not sold data. eBay sold comps
 * need Marketplace Insights approval we do not have, so treat 7494 as a
 * ceiling-ish marker rather than a realised price.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SHELF = 44.99, TAX = 0.1055, QTY = 6;
const UNIT = Math.round(SHELF * (1 + TAX) * 100);   // 4974

(async () => {
  const [{ user_id }]: any = await sql`select user_id from purchases order by id desc limit 1`;
  console.log(QTY + ' packs @ $' + (UNIT/100).toFixed(2) + ' = $' + (UNIT*QTY/100).toFixed(2) +
    '   (receipt math: 3 x $99.47 = $298.41)');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  let [ci]: any = await sql`select id, name from catalog_items where name = 'The Hobbit Collector Booster Pack'`;
  if (!ci) {
    const [{ m }]: any = await sql`select max(id) m from catalog_items`;
    const id = Number(m) + 1;
    await sql`insert into catalog_items (id, kind, name, set_name, product_type, manual_market_cents, manual_market_at)
      values (${id}, 'sealed', 'The Hobbit Collector Booster Pack',
              'Magic: The Gathering - The Hobbit', 'Collector Booster', 7494, now())`;
    ci = { id, name: 'The Hobbit Collector Booster Pack' };
    console.log('created catalog item ' + id + ': ' + ci.name);
  } else console.log('catalog item already exists: ' + ci.id);

  const [ins]: any = await sql`insert into purchases
      (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    values (${user_id}, ${ci.id}, '2026-09-15', ${QTY}, ${UNIT}, 'Target', 'Northgate',
      ${'Target Northgate 302 NE Northgate Way Seattle, 09/15/2026 16:41, receipt IMG_4284, DPCI ' +
        '361014334 WzrdsOTCoast, $44.99 shelf + 10.55% WA tax = $49.74 a pack. Six bought across THREE ' +
        'separate transactions; one receipt photographed, Michael said to multiply by three. Six at ' +
        '$49.74 is $298.44 against a real $298.41, three cents of integer rounding. ' +
        'Bought at plain MSRP while live single-pack asks ran $65 to $80, median about $75. ' +
        'First MTG product in the vault.'})
    returning id`;
  console.log('logged purchase ' + ins.id + ': ' + QTY + ' x ' + ci.name);
  await sql.end();
})();
