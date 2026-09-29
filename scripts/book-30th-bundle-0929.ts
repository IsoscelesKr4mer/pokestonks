/**
 * Book the 30th Celebration bundle, and fix the handling time that made it a
 * defect risk.
 *
 *   npx tsx scripts/book-30th-bundle-0929.ts            # report
 *   npx tsx scripts/book-30th-bundle-0929.ts --apply    # book + revise
 *
 * "just sold a 30th bundle - these dont stip until 10/2 i think"
 *
 * eBay order 05-15241-32046, item 168639528385, 2026-09-29 20:11Z.
 *
 *   item       $89.99
 *   shipping    11.84   calculated, buyer paid
 *   total     $101.83   -> the fee base
 *   fee       -$13.89   13.25% of 101.83 + 0.40
 *   cost      -$29.82   pu593, bought 2026-07-15
 *   profit    +$46.28   on a $29.82 basis, 155%
 *
 * THE REAL PROBLEM IS THE HANDLING TIME, NOT THE SALE. The listing is a
 * declared PRESALE for product that does not release until 10/2, and it is set
 * to **1 day handling**. eBay computed the buyer's delivery estimate off that,
 * so the ship-by date has already passed the moment the order landed and he
 * physically cannot meet it. Late tracking upload is an automated on-time
 * shipping defect, on a 2012 account.
 *
 * Handling goes to 5 days, which covers a 10/2 release from any purchase in the
 * next few days, and the remaining FIVE units stop generating the same
 * exposure. The existing order is already stamped with the old estimate, so it
 * needs a message to the buyer rather than a revise.
 *
 * Not touching the PRESALE wording. On 2026-09-21 that word was stripped from
 * this exact listing and he corrected it - "Bundles don't release until
 * October" - because removing it created a false in-hand claim.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '05-15241-32046';
const ITEM = '168639528385';
const DATE = '2026-09-29';
const REVENUE = 8999;
const FEES = 1389;      // 13.25% of the $101.83 order total + $0.40
const LOT = 593;
const HANDLING = 5;

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('30th Celebration Booster Bundle')) throw new Error('pu' + LOT + ' is ' + p.name);
  const open = p.quantity - p.sold;
  if (open < 1) throw new Error('pu' + LOT + ' has nothing open');

  console.log('sale: rev $' + (REVENUE / 100).toFixed(2) + '  fees $' + (FEES / 100).toFixed(2)
    + '  cost $' + (p.cost_cents / 100).toFixed(2)
    + '  = $' + ((REVENUE - FEES - p.cost_cents) / 100).toFixed(2)
    + '   (' + Math.round(((REVENUE - FEES - p.cost_cents) / p.cost_cents) * 100) + '% on cost)');

  const [dupe] = await sql`select count(*)::int n from ebay_synced_orders where ebay_order_id = ${ORDER}`;
  if (dupe.n) console.log('  already booked');
  else if (APPLY) {
    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${USER}, ${LOT}, ${DATE}, 1, ${REVENUE}, ${FEES}, ${p.cost_cents}, 'eBay',
        ${'eBay order ' + ORDER + '. Item $89.99 plus $11.84 calculated shipping = $101.83; '
          + 'revenue is the item subtotal with the label out, fee on the full total. '
          + 'PRESALE: the 30th Celebration bundles do not release until 2026-10-02, so this '
          + 'ships then, not within the 1-day handling the listing was carrying. Handling '
          + 'raised to 5 days for the remaining units; this buyer needs a message instead, '
          + 'because the delivery estimate was already stamped at purchase.'})
      returning id`;
    console.log('  sale#' + s.id + ' booked, pu' + LOT + ' now ' + (open - 1) + ' open');
    await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
      values (${USER}, ${ORDER}, false, now()) on conflict do nothing`;
  }

  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!)
      + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': j.access_token, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  const pre = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  const g = (t: string, s = pre) => s.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('\nlisting ' + ITEM + '  $' + g('CurrentPrice') + '  qty ' + g('Quantity')
    + '  sold ' + g('QuantitySold') + '  handling ' + g('DispatchTimeMax') + 'd');
  if (APPLY && g('DispatchTimeMax') !== String(HANDLING)) {
    const r = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + ITEM + '</ItemID><DispatchTimeMax>' + HANDLING + '</DispatchTimeMax></Item>');
    console.log('  revise ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    const v = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('  handling now ' + g('DispatchTimeMax', v) + 'd  (covers the 10/2 release)');
  }
  await sql.end();
})();
