/**
 * Log the six Barnes & Noble early-release boxes.
 *
 *   npx tsx scripts/log-bn-early-0928.ts
 *
 * Barnes & Noble Booksellers #2280, 401 NE Northgate Way, Seattle WA, receipt
 * 2026-09-28, TRN 5046. Seattle's 10.550%, matching what is on file.
 *
 *   2 x 2026 NFL Topps Bowman Mega Box      64.99 less 1.30 rewards = 63.69
 *   2 x 2026 NFL Topps Bowman EA Blaster    29.99 less 0.60 rewards = 29.39
 *   2 x Star Wars Chrome Blaster (2026)     29.99 less 0.60 rewards = 29.39
 *   bag fee 0.08, subtotal 245.02, tax 25.85, TOTAL 270.87
 *
 * Rewards discounts come off BEFORE tax, so cost basis is the discounted line
 * times 1.1055, not the shelf price. Mega $70.41, the other two $32.49 each.
 * That reconciles to $270.78 against $270.87 paid; the 9 cent gap is the taxed
 * bag fee, left unallocated rather than smeared across the boxes.
 *
 * "This might have been a bit of a hasty purchase - just had so much luck
 * before with early in hand product"
 *
 * It was not. At the asks already live it is +$67.96 on $270.87, about 25%, and
 * every Best Offer floor still clears cost:
 *
 *              cost    ask     net    profit   floor  net@floor
 *   Mega      70.41   99.99   84.69   +14.28   88.00    +4.13
 *   Blaster   32.49   49.99   42.34    +9.85   43.00    +3.93
 *   Star Wars 32.49   49.99   42.34    +9.85   43.00    +3.93
 *
 * THE RISK IS WEDNESDAY, NOT THE PRICE. Every competing listing is a presale
 * that converts to in-hand on the 30th, and the in-hand premium disappears with
 * it. The window is two days wide. That is an argument against reloading
 * tomorrow, not against the six he already has.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-28';
const SRC = 'Barnes & Noble';
const LOC = 'Northgate, Seattle WA';

// name, set_name, product_type, upc-ish note, unit cents, ebay item id
const ITEMS: [string, string, string, number, string, string][] = [
  ['2026 Bowman Football Mega Box', '2026 Bowman Football', 'Mega Box', 7041, '887521163281', '168737029210'],
  ['2026 Bowman Football Blaster Box', '2026 Bowman Football', 'Blaster Box', 3249, '887521163236', '168737029255'],
  ['2026 Topps Chrome Star Wars Blaster Box', '2026 Topps Chrome Star Wars', 'Blaster Box', 3249, '887521161195', '168737029292'],
];

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [seq] = await sql`select max(id) mx, (select last_value from catalog_items_id_seq) sq from catalog_items`;
  if (Number(seq.sq) < Number(seq.mx)) {
    await sql`select setval('catalog_items_id_seq', (select max(id) from catalog_items), true)`;
    console.log('  resynced catalog_items_id_seq');
  }

  let total = 0;
  for (const [name, setName, type, cents, upc, itemId] of ITEMS) {
    let [ci] = await sql`select id from catalog_items where name = ${name}`;
    if (!ci) {
      [ci] = await sql`insert into catalog_items (kind, name, set_name, product_type, release_date)
        values ('sealed', ${name}, ${setName}, ${type}, '2026-09-30') returning id`;
      console.log('  catalog#' + ci.id + '  ' + name);
    } else console.log('  catalog exists: ' + name);

    const [dupe] = await sql`select count(*)::int n from purchases
      where catalog_item_id = ${ci.id} and purchase_date = ${DATE} and deleted_at is null`;
    if (dupe.n) { console.log('    already logged'); continue; }

    const [p] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${ci.id}, ${DATE}, 2, ${cents}, ${SRC}, ${LOC},
        ${'Shelved early, street date 2026-09-30. UPC ' + upc + '. Rewards discount came off '
          + 'before tax, so basis is the discounted line x 1.1055 (Seattle 10.550%), not the '
          + 'shelf price. Listed same night as eBay ' + itemId + ' while every competing '
          + 'listing was still a presale.'})
      returning id`;
    total += cents * 2;
    console.log('    pu' + p.id + '  x2 @ $' + (cents / 100).toFixed(2)
      + ' = $' + ((cents * 2) / 100).toFixed(2));

    const [m] = await sql`select count(*)::int n from ebay_listing_mappings where ebay_item_id = ${itemId}`;
    if (!m.n) {
      await sql`insert into ebay_listing_mappings (user_id, ebay_item_id, mappings, created_at, updated_at)
        values (${USER}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: Number(ci.id) }])}, now(), now())`;
      console.log('    mapped ' + itemId + ' -> catalog#' + ci.id + ' at qty 1 per unit');
    }
  }
  if (total) console.log('\n  6 boxes, $' + (total / 100).toFixed(2)
    + ' allocated against $270.87 paid (9c taxed bag fee unallocated)');
  await sql.end();
})();
