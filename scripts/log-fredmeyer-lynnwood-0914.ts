/**
 * Log the second Fred Meyer run: 6 NBA megas, 10 NBA blasters, 10 Bowman
 * Chrome megas that are not supposed to be on shelves until 09-23.
 *
 *   npx tsx scripts/log-fredmeyer-lynnwood-0914.ts --apply
 *
 * Receipt IMG_4211: Fred Meyer 4615 196th St, Lynnwood WA 98036, 09/14/26
 * 11:57AM, 26 items, total $1,616.09.
 *
 *   10 x 49.99  SKU 88752116362  Bowman Chrome mega   (new catalog row)
 *   10 x 44.99  SKU 88752116142  NBA Value/blaster    catalog 135079
 *    6 x 84.99  SKU 88752116147  NBA Chrome Update mega catalog 135078
 *    2 x  0.08  checkout bag, not inventory
 *
 * Cards subtotal $1,459.74, bag $0.16, tax $156.19. That is 10.699% on this
 * receipt, a different rate again from Shoreline's 10.50% and Seattle's
 * 10.55%, so it is taken off this receipt rather than assumed. Per-unit costs
 * carry their own share of tax and exclude the bag.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CARDS_SUB = 1459.74, BAG = 0.16, TAX = 156.19, TOTAL = 1616.09;
const RATE = TAX / (CARDS_SUB + BAG);
const unit = (shelf: number) => Math.round(shelf * (1 + RATE) * 100);

const LOTS = [
  { catalog: 0,      qty: 10, shelf: 49.99, label: '2026 Bowman Chrome Baseball Mega Box', sku: '88752116362' },
  { catalog: 135079, qty: 10, shelf: 44.99, label: '2025-26 Topps Chrome Update Basketball Value Box', sku: '88752116142' },
  { catalog: 135078, qty: 6,  shelf: 84.99, label: '2025-26 Topps Chrome Update Basketball Mega Box', sku: '88752116147' },
];

(async () => {
  console.log('receipt total $' + TOTAL.toFixed(2) + ', tax rate ' + (RATE*100).toFixed(3) + '%');
  let sum = 0;
  for (const l of LOTS) { const u = unit(l.shelf); sum += u * l.qty;
    console.log('  ' + String(l.qty).padStart(2) + ' x $' + l.shelf.toFixed(2) + ' -> $' + (u/100).toFixed(2) + '/unit   ' + l.label); }
  console.log('cards booked: $' + (sum/100).toFixed(2) + '   receipt less bag and its tax: $' + (TOTAL - BAG*(1+RATE)).toFixed(2));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const [{ user_id }]: any = await sql`select user_id from purchases order by id desc limit 1`;

  let bowman: number | null = null;
  const [existing]: any = await sql`select id from catalog_items
    where name = '2026 Bowman Chrome Baseball Mega Box'`;
  if (existing) { bowman = Number(existing.id); console.log('\ncatalog row already exists: ' + bowman); }
  else {
    const [{ m }]: any = await sql`select max(id) m from catalog_items`;
    bowman = Number(m) + 1;
    await sql`insert into catalog_items (id, kind, name, set_name, product_type, release_date, manual_market_cents, manual_market_at)
      values (${bowman}, 'sealed', '2026 Bowman Chrome Baseball Mega Box', '2026 Bowman Chrome Baseball',
              'Mega Box', '2026-09-23', null, null)`;
    console.log('\ncreated catalog item ' + bowman + ': 2026 Bowman Chrome Baseball Mega Box (release 2026-09-23)');
  }
  LOTS[0].catalog = bowman;

  for (const l of LOTS) {
    const u = unit(l.shelf);
    const [ins]: any = await sql`insert into purchases
        (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
      values (${user_id}, ${l.catalog}, '2026-09-14', ${l.qty}, ${u}, 'Fred Meyer', 'Lynnwood',
        ${'Second Fred Meyer run of the day, 4615 196th St Lynnwood, 09/14/26 11:57AM, receipt IMG_4211, ' +
          '26 items, $' + TOTAL.toFixed(2) + ' total. SKU ' + l.sku + ' at $' + l.shelf.toFixed(2) + ' shelf. ' +
          'Tax on this receipt is ' + (RATE*100).toFixed(3) + '%, which is Lynnwood, not the 10.50% at Shoreline ' +
          'or 10.55% in Seattle, so the rate is taken off the receipt. Unit cost carries its share of tax and ' +
          'excludes the $0.16 checkout bag.' +
          (l.catalog === bowman ? ' NOT YET RELEASED: this product street dates 2026-09-23, Fred Meyer put it out early.' : '')})
      returning id`;
    console.log('  purchase ' + ins.id + '  qty ' + l.qty + ' @ $' + (u/100).toFixed(2) + '  ' + l.label);
  }

  console.log('\non hand now:');
  const h: any = await sql`select ci.id, ci.name,
      sum(p.quantity) bought,
      coalesce((select sum(s.quantity) from sales s join purchases p2 on p2.id=s.purchase_id
        where p2.catalog_item_id=ci.id),0) sold
    from purchases p join catalog_items ci on ci.id=p.catalog_item_id
    where p.catalog_item_id in ${sql([135078, 135079, bowman])} and p.deleted_at is null
    group by ci.id, ci.name order by ci.id`;
  h.forEach((x: any) => console.log('  ' + x.name + ': bought ' + x.bought + ', sold ' + x.sold + ', on hand ' + (x.bought - x.sold)));
  await sql.end();
})();
