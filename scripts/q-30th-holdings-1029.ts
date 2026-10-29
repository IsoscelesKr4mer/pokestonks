/**
 * Everything 30th Celebration he holds. Read-only.
 *
 *   npx tsx scripts/q-30th-holdings-1029.ts
 *
 * Michael, 2026-10-29: "list all the 30th anniversary i have"
 *
 * HELD IS NOT SUM(quantity). Rips, box decompositions and sales all come off,
 * attributed per PURCHASE LOT, and soft-deleted lots are dropped. Aggregating
 * consumption by catalog_item_id instead lets a consumed-then-deleted lot eat
 * a live one. This has gone wrong twice in two days, both times in a summary
 * block tacked onto the end of a script
 * ([[feedback_adhoc_holdings_query_shape]], [[reference_pokestonks_held_qty]]),
 * so bought and held print as two separate numbers and neither is labelled the
 * other.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const money = (c: number) => '$' + (c / 100).toFixed(2);

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const rows = await sql`
    select c.id, c.name, c.product_type,
      coalesce(c.manual_market_cents, c.last_market_cents) market,
      p.id pid, p.purchase_date::text d, p.quantity, p.cost_cents, p.source,
      (select count(*)::int from rips r where r.source_purchase_id = p.id) rips,
      (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id) decomps,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from catalog_items c
    join purchases p on p.catalog_item_id = c.id and p.deleted_at is null
    where c.name ilike '%30th%'
    order by c.name, p.purchase_date, p.id`;

  type Agg = {
    name: string;
    type: string | null;
    market: number | null;
    bought: number;
    held: number;
    basis: number;
    gone: string[];
  };
  const byItem = new Map<number, Agg>();

  for (const r of rows) {
    const held = r.quantity - r.rips - r.decomps - r.sold;
    let a = byItem.get(r.id);
    if (!a) {
      a = { name: r.name, type: r.product_type, market: r.market, bought: 0, held: 0, basis: 0, gone: [] };
      byItem.set(r.id, a);
    }
    a.bought += r.quantity;
    a.held += held;
    a.basis += held * r.cost_cents;
    if (held !== r.quantity) {
      const why: string[] = [];
      if (r.sold) why.push(`${r.sold} sold`);
      if (r.rips) why.push(`${r.rips} ripped`);
      if (r.decomps) why.push(`${r.decomps} broken up`);
      a.gone.push(`${r.d} lot of ${r.quantity}: ${why.join(', ')}`);
    }
  }

  const items = [...byItem.entries()].sort((x, y) => {
    const h = y[1].held - x[1].held;
    return h !== 0 ? h : x[1].name.localeCompare(y[1].name);
  });

  let bought = 0, held = 0, basis = 0, value = 0, unpriced = 0;
  console.log('30TH CELEBRATION, EVERYTHING HELD\n');
  for (const [id, a] of items) {
    bought += a.bought;
    held += a.held;
    basis += a.basis;
    if (a.market) value += a.held * a.market;
    else if (a.held) unpriced += a.held;
    const short = a.name.replace('Pokemon TCG: ', '').replace('30th Celebration ', '');
    console.log(
      `  ${String(a.held).padStart(3)} held` +
        (a.bought === a.held ? '        ' : ` (${a.bought} bought)`) +
        `  ${money(a.basis).padStart(9)} in` +
        `  ${(a.market ? money(a.held * a.market) : 'no price').padStart(9)}` +
        `   ${short}  [${id}]`
    );
    for (const g of a.gone) console.log(`         ${g}`);
  }

  console.log('');
  console.log(`  ${held} units held of ${bought} bought, across ${items.length} products.`);
  console.log(`  ${money(basis)} cost basis on what is still here.`);
  console.log(
    `  ${money(value)} at market` + (unpriced ? `, plus ${unpriced} unit(s) with no price on file.` : '.')
  );
  const pl = value - basis;
  if (value) {
    console.log(
      `  ${pl >= 0 ? '+' : ''}${money(pl)} unrealised` +
        (basis ? ` (${((pl / basis) * 100).toFixed(1)}%)` : '') +
        (unpriced ? ', ignoring the unpriced ones.' : '.')
    );
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
