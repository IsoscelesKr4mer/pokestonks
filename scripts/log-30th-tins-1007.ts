/**
 * The five 30th Celebration mini tins: four from the Target Northgate restock
 * on 2026-10-07, one from Zulu's Board Games on bundles release day.
 *
 *   npx tsx scripts/log-30th-tins-1007.ts
 *
 * Michael named the variants when asked, because the receipt could not: Target
 * rings all ten mini tin variants under the single DPCI 361000053.
 *
 *   "pikechu two moltres and a zapdos"  -> 1 Pikachu, 2 Moltres, 1 Zapdos
 *   "day pika"                          -> the Pikachu is Day, not Night
 *
 * TARGET, 2026-10-07, $12.99 sticker on the 16:46 and 16:50 receipts, Seattle
 * tax 10.55000 as printed. $12.99 x 1.1055 = $14.36.
 *
 * ZULU'S BOARD GAMES, Lynnwood. "i also bought a mew on bundles release day
 * from zulu games for the same price". Two things are DERIVED here rather
 * than stated, and both are in the lot notes so they can be corrected:
 *
 *   DATE 2026-07-15. Every other 30th Celebration product in the ledger first
 *   appears on that date (six lots, all Pokemon Center), so it is release day.
 *
 *   COST $14.38, not $14.36. "The same price" reads as the same $12.99
 *   sticker, and Zulu's is in Lynnwood, whose rate is 10.699% rather than
 *   Seattle's 10.55%. $12.99 x 1.10699 = $14.38. Two cents, and worth getting
 *   right rather than copying the Target figure across a city line.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

type Lot = {
  catalogId: number;
  expect: string;
  date: string;
  qty: number;
  cents: number;
  source: string;
  location: string;
  notes: string;
};

const TARGET_NOTE =
  'Target Northgate, 302 NE Northgate Way. Restock, receipts photographed (IMG_0808). ' +
  'Sticker $12.99 x 1.1055 for Seattle 10.55%. Variant named by Michael, because Target ' +
  'rings all ten 30th mini tin variants under one DPCI (361000053) and the receipt cannot ' +
  'distinguish them.';

const LOTS: Lot[] = [
  { catalogId: 133885, expect: 'Mini Tin [Day Pikachu]', date: '2026-10-07', qty: 1, cents: 1436,
    source: 'Target', location: 'Seattle, WA', notes: TARGET_NOTE },
  { catalogId: 133888, expect: 'Mini Tin [Moltres]', date: '2026-10-07', qty: 2, cents: 1436,
    source: 'Target', location: 'Seattle, WA', notes: TARGET_NOTE },
  { catalogId: 133889, expect: 'Mini Tin [Zapdos]', date: '2026-10-07', qty: 1, cents: 1436,
    source: 'Target', location: 'Seattle, WA', notes: TARGET_NOTE },
  { catalogId: 133887, expect: 'Mini Tin [Mew]', date: '2026-07-15', qty: 1, cents: 1438,
    source: "Zulu's Board Games", location: 'Lynnwood, WA',
    notes:
      'Bought on 30th Celebration bundles release day, reported 2026-10-07 alongside the Target ' +
      'restock. TWO FIGURES DERIVED, NOT STATED, correct them if wrong: the DATE is 2026-07-15 ' +
      'because every other 30th product in the ledger first appears then (six lots, all Pokemon ' +
      'Center); the COST is $12.99 x 1.10699 for Lynnwood 10.699%, since he said "the same ' +
      'price" and Zulu\'s is not in Seattle.' },
];

(async () => {
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
      where catalog_item_id = ${lot.catalogId} and purchase_date = ${lot.date} and deleted_at is null`;
    if (dupe.n) {
      console.log(`  already logged: ${ci.name} on ${lot.date}`);
      continue;
    }

    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${lot.catalogId}, ${lot.date}, ${lot.qty}, ${lot.cents},
        ${lot.source}, ${lot.location}, ${lot.notes})
      returning id`;
    written++;
    console.log(
      `  pu#${r.id}  ${lot.date}  x${lot.qty} @ $${(lot.cents / 100).toFixed(2)}` +
        `  = $${((lot.qty * lot.cents) / 100).toFixed(2)}  ${ci.name}`
    );
  }

  console.log(`\n${written} lot(s) written.`);
  const [tins] = await sql`select coalesce(sum(p.quantity), 0)::int q
    from purchases p join catalog_items c on c.id = p.catalog_item_id
    where c.name ilike '%30th Celebration Mini Tin%' and p.deleted_at is null`;
  console.log(`30th mini tins held across all variants: ${tins.q}`);
  await sql.end();
})();
