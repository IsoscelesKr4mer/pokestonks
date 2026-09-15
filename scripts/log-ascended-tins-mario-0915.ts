/**
 * 6 Ascended Heroes Mega ex tins from Target, straight out to Mario.
 *
 *   npx tsx scripts/log-ascended-tins-mario-0915.ts --apply
 *
 * Voice note 2026-09-15: "I found some ascended heroes tins at Target today.
 * I bought six of them. It was three different trips inside though... you can
 * just multiply this by three for my cost and I already sold them to my friend
 * Mario who lives in Hawaii who takes all my ascended heroes and he paid me
 * $40 a pop for them on Venmo." Then "I got 2 of each."
 *
 * Receipt IMG_4264: Target Northgate, 302 NE Northgate Way Seattle, 09/15/2026
 * 09:38, DPCI 361000057, 2 @ $24.99 = $49.98 + 10.55% WA tax $5.27 = $55.25.
 * That receipt is one of three identical transactions, so 6 tins for $165.75.
 *
 * $24.99 is the standard Mega ex tin, and there are three of them. Two each of
 * Emboar, Feraligatr and Meganium, confirmed by Michael rather than guessed,
 * because all three ring up at the same price and the receipt only says
 * "Pokemon".
 *
 * Unit cost $27.63 is $24.99 x 1.1055. Six of those is $165.78 against a real
 * $165.75, three cents of integer rounding, because the register taxes the
 * subtotal rather than each item.
 *
 * Sold same day, all six, $40 each on Venmo. Not cheap despite a ~$45 market:
 * $45 on eBay nets about $37 after fees and shipping, so $40 cash clears more
 * with no listing and no label.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UNIT = 2763;       // $24.99 x 1.1055
const QTY_EACH = 2;
const SALE_EACH = 4000;  // $40 a tin
const TINS = [
  { catalog: 130048, label: 'Ascended Heroes Tin [Mega Emboar ex]' },
  { catalog: 130046, label: 'Ascended Heroes Tin [Mega Feraligatr ex]' },
  { catalog: 130049, label: 'Ascended Heroes Tin [Mega Meganium ex]' },
];

(async () => {
  const [{ user_id }]: any = await sql`select user_id from purchases order by id desc limit 1`;
  const cost = UNIT * QTY_EACH * TINS.length;
  const rev = SALE_EACH * QTY_EACH * TINS.length;
  console.log('6 tins @ $' + (UNIT/100).toFixed(2) + ' = $' + (cost/100).toFixed(2) + '  (receipt math $165.75)');
  console.log('sold 6 @ $' + (SALE_EACH/100).toFixed(2) + ' = $' + (rev/100).toFixed(2));
  console.log('profit $' + ((rev-cost)/100).toFixed(2));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const group = randomUUID();
  for (const t of TINS) {
    const [ci]: any = await sql`select id, name from catalog_items where id = ${t.catalog}`;
    if (!ci) throw new Error('catalog ' + t.catalog + ' missing');
    const [buy]: any = await sql`insert into purchases
        (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
      values (${user_id}, ${t.catalog}, '2026-09-15', ${QTY_EACH}, ${UNIT}, 'Target', 'Northgate',
        ${'Target Northgate 302 NE Northgate Way Seattle, 09/15/2026 09:38, receipt IMG_4264, DPCI ' +
          '361000057, $24.99 shelf + 10.55% WA tax = $27.63. Bought 6 tins total across THREE separate ' +
          'transactions inside the store, 2 of each character; only one receipt was photographed and ' +
          'Michael said to multiply it by three. Six at $27.63 is $165.78 against a real $165.75, three ' +
          'cents of integer rounding.'})
      returning id`;
    const [sale]: any = await sql`insert into sales
        (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      values (${user_id}, ${buy.id}, '2026-09-15', ${QTY_EACH}, ${SALE_EACH*QTY_EACH}, 0, ${UNIT*QTY_EACH}, 'Venmo',
        ${'Sold same day to Mario in Hawaii, who takes all of Michael\'s Ascended Heroes, $40 a tin on ' +
          'Venmo, no fees and no shipping cost booked. Six tins, 2 of each character, $240 total. ' +
          'Above net market: these tins run about $45, which nets roughly $37 on eBay after fees and ' +
          'shipping, so $40 cash is the better exit.'}, ${group})
      returning id`;
    console.log('  ' + ci.name + '  ->  lot ' + buy.id + ', sale ' + sale.id);
  }

  const chk: any = await sql`
    with consumed as (select p.id,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used from purchases p)
    select ci.name, sum(greatest(p.quantity-c.used,0)) held
    from purchases p join catalog_items ci on ci.id=p.catalog_item_id join consumed c on c.id=p.id
    where p.catalog_item_id in (130046,130048,130049) and p.deleted_at is null
    group by ci.name order by ci.name`;
  console.log('\non hand after:');
  chk.forEach((x: any) => console.log('  ' + x.held + '  ' + x.name));
  await sql.end();
})();
