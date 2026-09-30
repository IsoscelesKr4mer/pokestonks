/**
 * He opened one of the two football megas. Drop the listing to 1 and record it.
 *
 *   npx tsx scripts/rip-fb-mega-0930.ts            # report
 *   npx tsx scripts/rip-fb-mega-0930.ts --apply    # revise + record
 *
 * "I also opned a bowman mega box cause I was curious so you can take one down"
 *
 * The listing half is the urgent one: it advertises 2 and only 1 exists, so
 * until it is revised a buyer can pay for a box that is already open. That is
 * the overcommit case from [[feedback_offebay_exits_leave_listings_live]] with
 * a rip instead of an off-eBay sale.
 *
 * `Quantity` on a revise is the AVAILABLE quantity, not the original total
 * ([[reference_ebay_variation_revise_rules]]), so 1 is the right value with 0
 * sold.
 *
 * A rip is NOT a sale. It leaves held quantity without any revenue, so it goes
 * in `rips` rather than `sales`; booking a $0 sale would report a phantom
 * $70.41 loss. Held reads purchases minus rips minus decompositions minus
 * sales ([[reference_pokestonks_held_qty]]).
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ITEM = '168737029210';
const LOT = 633;
const DATE = '2026-09-30';

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

  const cols = await sql`select column_name from information_schema.columns where table_name = 'rips'`;
  const names = cols.map((c: any) => c.column_name);
  console.log('rips columns: ' + names.join(', '));

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.id cid, ci.name
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('Mega')) throw new Error('pu' + LOT + ' is ' + p.name);
  // one row per box ripped; the table keys on source_purchase_id and has no quantity
  const [r] = await sql`select count(*)::int n from rips where source_purchase_id = ${LOT}`;
  const [s] = await sql`select coalesce(sum(quantity), 0)::int n from sales where purchase_id = ${LOT}`;
  const held = p.quantity - Number(r.n) - Number(s.n);
  console.log('pu' + LOT + '  ' + p.name + '  bought ' + p.quantity + ' @ $'
    + (p.cost_cents / 100).toFixed(2) + '  ripped ' + r.n + '  sold ' + s.n + '  HELD ' + held);

  // ---- eBay first: an over-advertised quantity is the thing that can cost money
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
  const g = (t: string, x = pre) => x.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('\nlisting ' + ITEM + '  $' + g('CurrentPrice') + '  qty ' + g('Quantity')
    + '  sold ' + g('QuantitySold'));
  if (APPLY) {
    const rev = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + ITEM + '</ItemID><Quantity>1</Quantity></Item>');
    console.log('  ack=' + (rev.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 150));
    const post = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('  now qty ' + g('Quantity', post) + '  sold ' + g('QuantitySold', post)
      + '  combined=' + g('ApplyShippingDiscount', post));
  }

  // ---- then the vault
  if (APPLY && Number(r.n) === 0) {
    const row: any = {
      user_id: USER,
      source_purchase_id: LOT,
      rip_date: DATE,
      pack_cost_cents: p.cost_cents,
      // no loss booked: the singles have no valuation table, same as every prior rip
      realized_loss_cents: 0,
      notes: 'Opened out of curiosity 2026-09-30, one of the two B&N early-release megas. '
        + 'Cards fanned on video (eBay_assets/card drop/IMG_0150.MOV) instead of photographed '
        + 'individually; 29 read off the video and every one cross-checked against the 2026 '
        + 'Bowman Football checklist. Listing dropped 2 -> 1 the same night so it could not '
        + 'sell a box that was already open. The $70.41 basis is unassigned, same as every '
        + 'prior rip.',
    };
    const [ins] = await sql`insert into rips ${sql(row)} returning id`;
    console.log('\n  rip#' + ins.id + ' recorded, held now ' + (held - 1));
  }
  await sql.end();
})();
