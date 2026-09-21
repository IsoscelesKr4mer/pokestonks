/**
 * Log the two Fred Meyer Shoreline runs on 2026-09-21, 22 units of 30th
 * Celebration sealed.
 *
 *   npx tsx scripts/log-30th-fredmeyer-0921.ts
 *
 * Both receipts were photographed and reconcile exactly, so nothing here is
 * estimated.
 *
 * Receipt 1, 09:38 on the second trip (IMG_4713):
 *   5 x TRADING CRD 11.99    59.95
 *   TAX                       6.29
 *   BALANCE                  66.24   -> 6.29/59.95 = 10.49%, Shoreline's rate
 *
 * Receipt 2, 08:44 on the first trip (IMG_4712), 17 items, balance $408.90:
 *   5 x 11.99  Knock Out Collection     59.95
 *   5 x 19.99  Poster Collection        99.95
 *   7 x 29.99  Sylveon + Greninja ex   209.93
 *   subtotal                           369.83
 *   checkout bag                         0.24
 *   tax                                 38.83
 *   total                              408.90
 * 369.83 is exactly the sum of his stated counts at the sticker prices visible
 * in IMG_4708 ($11.99) and IMG_4711 ($19.99) and the $29.99 on the ex boxes, so
 * the split across the four products is confirmed rather than inferred.
 *
 * Unit costs are sticker x 1.105, Shoreline's 10.50%: Knock Out $13.25, Poster
 * $22.09, ex Box $33.14. That totals $474.93 against $475.14 actually paid; the
 * 21 cent gap is the checkout bag and rounding, and it is left out rather than
 * smeared across the lots.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-21';

// catalog_item_id, qty, unit cents, label
const LOTS: [number, number, number, string][] = [
  [133878, 10, 1325, 'Knock Out Collection'],   // 5 + 5 across the two trips
  [133879, 5, 2209, 'Poster Collection'],
  [133880, 5, 3314, 'Greninja ex Box'],
  [133881, 2, 3314, 'Sylveon ex Box'],
];

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  for (const [cid, qty, cents, label] of LOTS) {
    const [ci] = await sql`select id, name from catalog_items where id = ${cid}`;
    if (!ci) throw new Error('catalog item ' + cid + ' missing');
    if (!ci.name.includes(label)) throw new Error('ci' + cid + ' is ' + ci.name + ', expected ' + label);

    const [dupe] = await sql`select count(*)::int n from purchases
      where catalog_item_id = ${cid} and purchase_date = ${DATE} and deleted_at is null`;
    if (dupe.n) { console.log('  already logged: ' + label); continue; }

    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${cid}, ${DATE}, ${qty}, ${cents}, 'Fred Meyer', 'Shoreline, WA',
        ${'18325 Aurora Ave N, receipts photographed. Sticker price x 1.105 for ' +
          "Shoreline's 10.50%. " +
          (cid === 133878
            ? 'Two trips the same morning, 5 at 08:44 and 5 more at 09:38; logged as one lot of 10 at the same price.'
            : 'Part of the 17-item 08:44 receipt totalling $408.90.')})
      returning id`;
    console.log('  logged pu#' + r.id + '  x' + qty + ' @ $' + (cents / 100).toFixed(2) +
      '  = $' + (qty * cents / 100).toFixed(2) + '  ' + label);
  }

  const [tot] = await sql`select sum(quantity)::int q, sum(quantity * cost_cents)::int c
    from purchases where purchase_date = ${DATE} and deleted_at is null`;
  console.log('\n' + DATE + ': ' + tot.q + ' units, $' + (tot.c / 100).toFixed(2) +
    '  (receipts say $475.14; the 21c gap is the checkout bag and rounding)');
  await sql.end();
})();
