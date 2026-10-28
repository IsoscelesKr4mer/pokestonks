/**
 * Eighteen 30th Celebration mini tins, Target Northgate, 2026-10-28.
 *
 *   npx tsx scripts/log-30th-tins-1028.ts
 *
 * "Bought 18 of these today in pairs i uploaded one receipt" - nine
 * transactions of two, one receipt photographed (IMG_2525): 2026-10-28
 * 09:13 AM, Northgate, 302 NE Northgate Way, 2 @ $12.99, subtotal $25.98,
 * WA TAX 10.55000 = $2.74, total $28.72. So $14.36 a tin, the same figure
 * as the 2026-10-07 restock, and 18 x $14.36 = $258.48.
 *
 * TWO THINGS ARE INFERRED AND ARE REPEATED IN THE LOT NOTES:
 *
 *   PRICE. One receipt covers two tins. The other eight pairs are logged at
 *   that same $14.36 because he said the one receipt stands for the buy. If
 *   a pair came from a different store the Seattle 10.55% would be wrong -
 *   Lynnwood and Shoreline both ring 10.50%, which would make it $14.35.
 *
 *   VARIANTS. Target rings all ten mini tin designs under the single DPCI
 *   361000053, so the receipt cannot name them. The split below was read off
 *   his photo (IMG_2524) against the ten TCGplayer product shots, not
 *   reported by him: all ten designs are present, and the duplicates are
 *   Lapras and Night Pikachu at three each, with Mew, Moltres, Greninja and
 *   Day Pikachu at two. Counted 3 + 5 + 5 + 5 across the four rows = 18.
 *
 * The pairs are a per-transaction limit, not matched designs - Zapdos,
 * Mewtwo, Umbreon and Espeon each came back as singles.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-10-28';
const UNIT_CENTS = 1436;

const NOTE =
  'Target Northgate, 302 NE Northgate Way, Seattle. Bought 18 in nine pairs, one receipt ' +
  'photographed (IMG_2525, 09:13 AM): 2 @ $12.99, WA TAX 10.55000, total $28.72, so $14.36 ' +
  'a tin. TWO FIGURES INFERRED, correct them if wrong: the PRICE on the eight unphotographed ' +
  'pairs is assumed equal to the receipted pair; the VARIANT is read off his photo IMG_2524 ' +
  'against the ten TCGplayer product shots, because Target rings all ten designs under one ' +
  'DPCI (361000053) and the receipt cannot distinguish them.';

type Lot = { catalogId: number; expect: string; qty: number };

// Read off IMG_2524, row by row, top to bottom:
//   row 1 (3): Mew, Lapras, Lapras
//   row 2 (5): Greninja, Night Pikachu, Night Pikachu, Zapdos, Mew
//   row 3 (5): Mewtwo, Greninja, Night Pikachu, Umbreon, Moltres
//   row 4 (5): Espeon, Day Pikachu, Lapras, Moltres, Day Pikachu
const LOTS: Lot[] = [
  { catalogId: 133884, expect: 'Mini Tin [Espeon]', qty: 1 },
  { catalogId: 133885, expect: 'Mini Tin [Day Pikachu]', qty: 2 },
  { catalogId: 133886, expect: 'Mini Tin [Lapras]', qty: 3 },
  { catalogId: 133887, expect: 'Mini Tin [Mew]', qty: 2 },
  { catalogId: 133888, expect: 'Mini Tin [Moltres]', qty: 2 },
  { catalogId: 133889, expect: 'Mini Tin [Zapdos]', qty: 1 },
  { catalogId: 133890, expect: 'Mini Tin [Umbreon]', qty: 1 },
  { catalogId: 133891, expect: 'Mini Tin [Night Pikachu]', qty: 3 },
  { catalogId: 133892, expect: 'Mini Tin [Mewtwo]', qty: 1 },
  { catalogId: 133893, expect: 'Mini Tin [Greninja]', qty: 2 },
];

(async () => {
  const total = LOTS.reduce((n, l) => n + l.qty, 0);
  if (total !== 18) throw new Error(`variant counts sum to ${total}, expected 18`);

  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  let written = 0;
  for (const lot of LOTS) {
    const [ci] = await sql`select id, name from catalog_items where id = ${lot.catalogId}`;
    if (!ci) throw new Error(`catalog item ${lot.catalogId} missing`);
    if (!ci.name.includes(lot.expect)) {
      throw new Error(`catalog ${lot.catalogId} is "${ci.name}", expected ${lot.expect}`);
    }

    const [dupe] = await sql`select count(*)::int n from purchases
      where catalog_item_id = ${lot.catalogId} and purchase_date = ${DATE} and deleted_at is null`;
    if (dupe.n) {
      console.log(`  already logged: ${ci.name} on ${DATE}`);
      continue;
    }

    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${lot.catalogId}, ${DATE}, ${lot.qty}, ${UNIT_CENTS},
        'Target', 'Seattle, WA', ${NOTE})
      returning id`;
    written++;
    console.log(
      `  pu#${r.id}  x${lot.qty} @ $${(UNIT_CENTS / 100).toFixed(2)}` +
        `  = $${((lot.qty * UNIT_CENTS) / 100).toFixed(2)}  ${ci.name}`
    );
  }

  console.log(`\n${written} lot(s) written, $${((total * UNIT_CENTS) / 100).toFixed(2)} in.`);

  const rows = await sql`select c.name, sum(p.quantity)::int q,
      sum(p.quantity * p.cost_cents)::int basis,
      (sum(p.quantity) * max(coalesce(c.manual_market_cents, c.last_market_cents)))::int value
    from purchases p join catalog_items c on c.id = p.catalog_item_id
    where c.name ilike '%30th Celebration Mini Tin [%' and p.deleted_at is null
    group by c.name order by c.name`;
  let q = 0, basis = 0, value = 0;
  console.log('\n30th mini tins held, all variants:');
  for (const r of rows) {
    q += r.q; basis += r.basis; value += r.value;
    console.log(
      `  ${String(r.q).padStart(2)}  $${(r.basis / 100).toFixed(2).padStart(7)} in` +
        `  $${(r.value / 100).toFixed(2).padStart(7)} market   ${r.name.replace(/^.*\[|\]$/g, '')}`
    );
  }
  console.log(
    `  ${String(q).padStart(2)}  $${(basis / 100).toFixed(2).padStart(7)} in` +
      `  $${(value / 100).toFixed(2).padStart(7)} market   TOTAL`
  );
  await sql.end();
})();
