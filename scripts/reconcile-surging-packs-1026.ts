/**
 * Surging Sparks loose packs: he physically counted 28, the vault held 20.
 * Books the 8 difference.
 *
 *   npx tsx scripts/reconcile-surging-packs-1026.ts           # dry run
 *   npx tsx scripts/reconcile-surging-packs-1026.ts --apply
 *
 * Michael, 2026-10-26: "i have 28 surging sparks booster packs not 20".
 *
 * WHERE THEY DID NOT COME FROM, checked before assuming. If 8 packs had come
 * out of a box he already owns, booking them at $5.00 each would double-count
 * $40 of cost that the box lot already carries. They did not: all seven
 * Surging Sparks booster box lots (119, 128, 165, 183, 224, 258, 283) were
 * SOLD whole, none was ripped and none decomposed, and there are zero
 * decompositions against any Surging Sparks item. So there is no un-booked
 * source inside the vault and these are unlogged vending singles.
 *
 * PRICE is the documented constant, not a guess: $4.49 + WA tax = $5.00 flat
 * is what all nineteen of his existing Surging Sparks pack lots carry. Two
 * earlier reconciliations used exactly this: lot 527 ("+2 previously
 * unlogged @ $5.00 standard vending pack price") and lot 598 (found in the
 * car, unknown_cost=true, $5.00 estimate).
 *
 * `unknown_cost` is set true, following lot 598. The per-pack PRICE is
 * well-established; what is unknown is the date, the machine and whether all
 * eight were even bought at the same price, so the lot is marked estimated
 * rather than presented as a receipt.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const CI = 19928; // Surging Sparks Booster Pack
const COUNTED = 28;
const COST_CENTS = 500;

async function heldNow(): Promise<number> {
  const [r] = await sql<{ held: number }[]>`
    SELECT coalesce(sum(
      p.quantity
      - coalesce((SELECT count(*) FROM rips r WHERE r.source_purchase_id = p.id),0)
      - coalesce((SELECT count(*) FROM box_decompositions b WHERE b.source_purchase_id = p.id),0)
      - coalesce((SELECT sum(s.quantity) FROM sales s WHERE s.purchase_id = p.id),0)
    ),0)::int AS held
    FROM purchases p
    WHERE p.catalog_item_id = ${CI} AND p.deleted_at IS NULL`;
  return r.held;
}

async function main() {
  const before = await heldNow();
  const gap = COUNTED - before;
  console.log(`vault holds ${before}, he counted ${COUNTED}, difference ${gap}`);

  if (gap === 0) {
    console.log('already reconciled, nothing to do');
    await sql.end();
    return;
  }
  if (gap < 0) {
    console.log('vault holds MORE than he counted; that is a different problem, refusing to guess');
    await sql.end();
    return;
  }

  const notes =
    `Inventory reconciliation to his physical count of ${COUNTED} on 2026-10-26: "i have 28 surging sparks ` +
    `booster packs not 20". The vault held ${before} across his vending single lots, so ${gap} were never logged. ` +
    `Checked first that they did not come out of sealed product already on the books: all seven Surging Sparks ` +
    `booster box lots were sold whole, none ripped or decomposed, so booking these does not double-count a box. ` +
    `$5.00 each is the standard vending pack price ($4.49 + WA tax) that all his other Surging Sparks pack lots ` +
    `carry; same basis as the lot 527 and lot 598 reconciliations. unknown_cost=true because the dates, the ` +
    `machines and whether all ${gap} were bought at that price are unknown, even though the price itself is the ` +
    `established constant.`;

  console.log(`\nwould add 1 lot: qty ${gap} @ $${(COST_CENTS / 100).toFixed(2)} = $${((gap * COST_CENTS) / 100).toFixed(2)}, unknown_cost=true`);
  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    await sql.end();
    return;
  }

  const [p] = await sql<{ id: number }[]>`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents,
                           source, location, notes, unknown_cost)
    VALUES (${UID}, ${CI}, '2026-10-26', ${gap}, ${COST_CENTS},
            'Vending Machine', 'Unknown', ${notes}, true)
    RETURNING id`;
  console.log(`lot #${p.id} written`);

  const after = await heldNow();
  console.log(`held ${before} -> ${after}` + (after === COUNTED ? '  MATCHES his count' : `  MISMATCH, expected ${COUNTED}`));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
