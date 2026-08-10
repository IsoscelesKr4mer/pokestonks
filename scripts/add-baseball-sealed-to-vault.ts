/**
 * Brings sealed baseball wax on-book. It was off-book from the July Bowman and
 * Finest tests onward; at 15 boxes and ~$1,073 it is well past test size.
 *
 * Integration shape (the thing to understand before adding more):
 *   - catalog_items already holds non-Pokemon lines (Disney Lorcana, One Piece).
 *     Nothing about the table is Pokemon-specific.
 *   - Sports differs in ONE way: TCGCSV has no sports categories, so there is no
 *     tcgplayer_product_id. Leaving it NULL is what keeps these items out of the
 *     daily Pokemon cron entirely (snapshotAllCatalogItems filters on
 *     isNotNull(tcgplayerProductId)), so they cannot interfere with it.
 *   - They price instead from SportsCardsPro sold data via
 *     scripts/refresh-sportscardspro.ts, into manual_market_cents. persistSnapshot
 *     already refuses to overwrite a non-null manual_market_cents, so even a
 *     future ID collision could not clobber a sports price.
 *
 *   npx tsx scripts/add-baseball-sealed-to-vault.ts           # dry run
 *   npx tsx scripts/add-baseball-sealed-to-vault.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

type Lot = { date: string; qty: number; costCents: number; source: string; location: string; notes: string };
type Item = { name: string; setName: string; productType: string; releaseDate: string; lots: Lot[] };

const ITEMS: Item[] = [
  {
    name: '2026 Topps Finest Baseball Mega Box',
    setName: '2026 Topps Finest',
    productType: 'Mega Box',
    releaseDate: '2026-07-10',
    lots: [{
      date: '2026-08-01', qty: 5, costCents: 7748, source: 'Fred Meyer', location: 'Lynnwood',
      notes: '5 boxes at $69.99 + $37.44 tax = $387.39 total, $77.48/box at a 10.7% effective rate. 4 of the 5 listed on eBay #168581678721.',
    }],
  },
  {
    name: '2026 Topps Chrome Baseball Mega Box',
    setName: '2026 Topps Chrome',
    productType: 'Mega Box',
    releaseDate: '2026-08-05',
    lots: [
      {
        date: '2026-08-05', qty: 2, costCents: 7738, source: "Dick's Sporting Goods", location: 'Seattle Northgate',
        notes: 'Release-day morning buy. $70.00 each + 10.5458% Seattle tax = $77.38/box.',
      },
      {
        date: '2026-08-05', qty: 8, costCents: 6633, source: "Dick's Sporting Goods", location: 'Seattle Northgate',
        notes: 'Release-day afternoon buy, 12:05pm. Register rang 7 of the 8 boxes: 7 x $70.00 less a $10 reward certificate = $480.00 + $50.62 tax = $530.62 paid, spread over the 8 actually held = $66.33/box. If the 8th is paid for later, re-cut to $75.80.',
      },
    ],
  },
];

async function main() {
  for (const item of ITEMS) {
    const [existing] = await sql<{ id: number }[]>`
      SELECT id FROM catalog_items WHERE name = ${item.name} LIMIT 1`;
    const totalQty = item.lots.reduce((a, l) => a + l.qty, 0);
    const totalCost = item.lots.reduce((a, l) => a + l.qty * l.costCents, 0);
    console.log(`${item.name}`);
    console.log(`   ${item.lots.length} lot(s), ${totalQty} boxes, $${(totalCost / 100).toFixed(2)}` +
      (existing ? `  [already exists as ci${existing.id}]` : ''));
    if (!APPLY || existing) continue;

    const [ci] = await sql<{ id: number }[]>`
      INSERT INTO catalog_items (kind, name, set_name, product_type, release_date, tcgplayer_product_id)
      VALUES ('sealed', ${item.name}, ${item.setName}, ${item.productType}, ${item.releaseDate}, NULL)
      RETURNING id`;
    console.log(`   catalog #${ci.id}`);
    for (const l of item.lots) {
      const [p] = await sql<{ id: number }[]>`
        INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
        VALUES (${UID}, ${ci.id}, ${l.date}, ${l.qty}, ${l.costCents}, ${l.source}, ${l.location}, ${l.notes})
        RETURNING id`;
      console.log(`   lot #${p.id}: ${l.date} qty ${l.qty} @ $${(l.costCents / 100).toFixed(2)}`);
    }
  }
  if (!APPLY) console.log('\ndry run - pass --apply to write');
  console.log('\nNext: npx tsx scripts/refresh-sportscardspro.ts --apply');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
