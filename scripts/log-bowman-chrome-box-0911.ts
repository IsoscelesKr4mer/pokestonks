/**
 * Log the 2026 Bowman Chrome hobby box Michael ripped on 2026-09-10.
 *
 *   npx tsx scripts/log-bowman-chrome-box-0911.ts --apply
 *
 * It had never been entered, so the 60 cards in baseball_cards had no cost
 * behind them and every ROI figure quoted on 2026-09-10 was against a box that
 * did not exist in the vault.
 *
 * $332.00 is Michael's stated total, $299.99 presale plus tax. He gave the
 * figure as an estimate ("like 332 i think"), which is recorded in the lot note
 * so it can be corrected off the Topps receipt without guessing later.
 *
 * The rip follows the One Piece precedent: realized_loss_cents is 0 because the
 * resulting singles live in baseball_cards, which is non-vault and has no
 * valuation table, so the basis is unassigned rather than written off.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const NAME = '2026 Bowman Chrome Baseball Hobby Box';
const COST = 33200;

(async () => {
  const existing = await sql`SELECT id FROM catalog_items WHERE name = ${NAME}`;
  if (existing.length) console.log('catalog item exists: ' + existing[0].id);
  const dupe = await sql`SELECT p.id FROM purchases p JOIN catalog_items c ON c.id = p.catalog_item_id
    WHERE c.name = ${NAME} AND p.deleted_at IS NULL`;
  if (dupe.length) { console.log('already logged, purchase ' + dupe[0].id); await sql.end(); return; }

  console.log('will create:');
  console.log('  catalog item  ' + NAME + '  [Hobby Box]');
  console.log('  purchase      2026-09-09  qty 1  $' + (COST / 100).toFixed(2) + '  source Topps');
  console.log('  rip           2026-09-10  basis $' + (COST / 100).toFixed(2) + '  realized loss $0');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const cid = existing.length ? existing[0].id : (await sql`
    INSERT INTO catalog_items (kind, name, set_name, product_type, manual_market_cents, manual_market_at)
    VALUES ('sealed', ${NAME}, '2026 Bowman Chrome Baseball', 'Hobby Box', 29999, now())
    RETURNING id`)[0].id;

  const pur = (await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${USER}, ${cid}, '2026-09-09', 1, ${COST}, 'Topps',
      ${'Topps presale, $299.99 plus tax. Michael reported the total as about $332; ' +
        'confirm against the Topps receipt if an exact basis is needed. Date is the ' +
        'delivery date, the presale order date is not recorded.'})
    RETURNING id`)[0].id;

  const rip = (await sql`
    INSERT INTO rips (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
    VALUES (${USER}, ${pur}, '2026-09-10', ${COST}, 0,
      ${'Ripped on release day. The 60 cards are catalogued in baseball_cards, which is ' +
        'non-vault, so this rip carries no realized loss and the basis is unassigned.'})
    RETURNING id`)[0].id;

  const held = await sql<{ n: number }[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips x WHERE x.source_purchase_id = p.id), 0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id = p.id), 0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id = p.id), 0)), 0)::int AS n
    FROM purchases p WHERE p.catalog_item_id = ${cid} AND p.deleted_at IS NULL`;

  console.log('catalog ' + cid + ' | purchase ' + pur + ' | rip ' + rip + ' | held now ' + held[0].n);
  await sql.end();
})();
