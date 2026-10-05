/**
 * Book four eBay card sales that never reached the vault.
 *
 *   npx tsx scripts/book-bowman-card-sales-1005.ts [--apply]
 *
 * Found while bumping the you-pick quantities: SKU BOWCH-YP-35-58 reported
 * QuantitySold 1 on eBay while the vault row still said status='listed'. Checking
 * every BOWCH- transaction since 2026-09-01 turned up four, not one:
 *
 *   2026-09-11  Julio Rodriguez  #35       $1.50   id615
 *   2026-09-13  Dax Kilby        BCP-224   $1.99   id608
 *   2026-09-15  Brandon Clarke   BCP-171   $3.99   id580
 *   2026-09-30  Caleb Bonemer    BCP-218   $7.00   id564   (Purple Wave /250)
 *
 * $14.48 of sales the vault did not know about. The existing
 * audit-unbooked-ebay-orders-0914.ts could never have caught these: it is scoped
 * to SEALED vault product and explicitly skips baseball cards, which is correct
 * for its job but leaves this gap. 29 card orders were skipped on that run.
 *
 * JULIO RODRIGUEZ NEEDS THE SUCCESSION HANDLED, not just a status flip. id615 is
 * copy 1 and it sold; id791 is copy 2 from box 5, held with duplicate_of_id=615.
 * So id791 is now his ONLY copy and has to become the live one: duplicate link
 * cleared, for_sale back on, and it inherits the listing + SKU. Otherwise the
 * card he still physically owns is marked unsellable while the one that is gone
 * holds the listing.
 *
 * The you-pick quantity already reads correctly either way - the bump computed
 * available as (total - sold) + extra, so that SKU sits at 1 available, which is
 * exactly the one copy he has left.
 *
 * Every write asserts the current value first, so a rerun cannot double-book.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Sale = { id: number; player: string; cents: number; date: string; order: string };
const SALES: Sale[] = [
  { id: 615, player: 'Julio Rodriguez', cents: 150, date: '2026-09-11', order: 'BOWCH-YP-35-58' },
  { id: 608, player: 'Dax Kilby', cents: 199, date: '2026-09-13', order: 'BOWCH-YP-BCP224-51' },
  { id: 580, player: 'Brandon Clarke', cents: 399, date: '2026-09-15', order: 'BOWCH-YP-BCP171-23' },
  { id: 564, player: 'Caleb Bonemer', cents: 700, date: '2026-09-30', order: 'BOWCH-BCP218-7' },
];

(async () => {
  for (const s of SALES) {
    const r = await sql`SELECT id, player, card_number, parallel, status, sold_price_cents, ebay_sku
      FROM baseball_cards WHERE id = ${s.id}`;
    const x = r[0] as any;
    console.log(`  id${s.id} ${x.player} #${x.card_number} ${x.parallel}`);
    console.log(`      now: status=${x.status} sold=${x.sold_price_cents ?? 'null'}  ->  sold $${(s.cents / 100).toFixed(2)} on ${s.date}`);
    if (x.player !== s.player) { console.log(`      ABORT: expected ${s.player}, found ${x.player}`); await sql.end(); return; }
  }

  const succ = await sql`SELECT id, status, for_sale, duplicate_of_id FROM baseball_cards WHERE duplicate_of_id = 615`;
  if (succ.length) {
    const k = succ[0] as any;
    console.log(`\n  succession: id${k.id} currently held as a duplicate of the SOLD id615`);
    console.log(`      -> promote to the live copy (clear duplicate_of_id, for_sale=true, inherit listing + SKU)`);
  }

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  let booked = 0;
  for (const s of SALES) {
    const r = await sql`UPDATE baseball_cards
      SET status = 'sold', for_sale = false,
          sold_price_cents = ${s.cents}, sold_date = ${s.date}::date,
          notes = coalesce(notes, '') || ${' | SOLD on eBay ' + s.date + ' for $' + (s.cents / 100).toFixed(2)
            + ' (SKU ' + s.order + '). Booked 2026-10-05 by book-bowman-card-sales-1005.ts - the sale had '
            + 'never reached the vault, which still had it as listed and on hand.'},
          updated_at = now()
      WHERE id = ${s.id} AND sold_price_cents IS NULL
      RETURNING id`;
    booked += r.length;
    if (!r.length) console.log(`  id${s.id} already had a sold price, left alone`);
  }
  console.log(`\nbooked ${booked} sale(s), $${(SALES.reduce((a, s) => a + s.cents, 0) / 100).toFixed(2)} total`);

  // Julio Rodriguez: the surviving copy inherits the listing
  const orig = await sql`SELECT ebay_item_id, ebay_sku, asking_price_cents FROM baseball_cards WHERE id = 615`;
  const o = orig[0] as any;
  const promoted = await sql`UPDATE baseball_cards
    SET duplicate_of_id = NULL, for_sale = true, status = 'listed',
        ebay_item_id = ${o.ebay_item_id}, ebay_sku = ${o.ebay_sku},
        asking_price_cents = ${o.asking_price_cents},
        notes = coalesce(notes, '') || ${' | PROMOTED to the live copy 2026-10-05: id615 (copy 1) sold on '
          + '2026-09-11, so this is now the only Julio Rodriguez #35 on hand. Inherited the listing and SKU. '
          + 'The you-pick quantity already reflects one available.'},
        updated_at = now()
    WHERE duplicate_of_id = 615
    RETURNING id, status, for_sale, ebay_sku`;
  promoted.forEach((r: any) => console.log(`promoted id${r.id} -> ${r.status}, for_sale=${r.for_sale}, sku ${r.ebay_sku}`));

  // invariants
  const dbl = await sql`SELECT count(*)::int n FROM (
      SELECT 1 FROM baseball_cards WHERE for_sale IS TRUE AND duplicate_of_id IS NULL
        AND card_number IS NOT NULL AND card_number <> 'UNKNOWN'
      GROUP BY player, set_name, card_number, parallel
      HAVING count(*) > 1 AND count(DISTINCT ebay_item_id) > 1) t`;
  console.log(`\ncards sellable across more than one listing: ${dbl[0].n}`);
  const sold = await sql`SELECT count(*)::int n, coalesce(sum(sold_price_cents),0)::int c
    FROM baseball_cards WHERE status='sold'`;
  console.log(`vault sold rows: ${sold[0].n}, $${(sold[0].c / 100).toFixed(2)} lifetime`);
  await sql.end();
})();
