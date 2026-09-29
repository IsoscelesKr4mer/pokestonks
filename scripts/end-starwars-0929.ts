/**
 * End the Star Wars blaster listing. Both boxes are going to a friend at cost.
 *
 *   npx tsx scripts/end-starwars-0929.ts --apply
 *
 * "You can end Star Wars blasters gonna give those to my friend for cost he's a
 * huge star wars guy"
 *
 * AT COST IS A SALE, NOT A GIVEAWAY. $32.49 a box changes hands, so when it
 * happens it books as a $64.98 sale at zero profit rather than being struck
 * from inventory the way a handed-over pack is
 * ([[feedback_which_cards_enter_vault]] covers the giveaway case, and this is
 * not it). Nothing is booked here: he said "gonna", the money has not moved,
 * and a sale booked before it happens is a fiction.
 *
 * What goes in now is a note on pu635 so the next audit that finds two unlisted
 * Star Wars blasters on hand does not offer to relist them - the same trap the
 * Sylveon gift had.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168737029292';
const LOT = 635;
const NOTE = ' | NOT FOR SALE ON EBAY: both boxes are going to a friend at cost, $32.49 each, '
  + 'agreed 2026-09-29. Listing 168737029292 ended the same night. Book it as a $64.98 sale '
  + 'at zero profit ONLY once he confirms the money moved; it is a sale at cost, not a giveaway, '
  + 'so it should not be struck from inventory.';

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
  console.log('before: ' + g('ListingStatus') + '  $' + g('CurrentPrice')
    + '  qty ' + g('Quantity') + '  sold ' + g('QuantitySold'));
  if (g('ListingStatus') !== 'Active') console.log('  not active, nothing to end');
  else if (APPLY) {
    const r = await call('EndFixedPriceItem',
      '<ItemID>' + ITEM + '</ItemID><EndingReason>NotAvailable</EndingReason>');
    console.log('  end ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 150));
    const post = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('after:  ' + g('ListingStatus', post));
  } else console.log('  dry run');

  const [p] = await sql`select id, quantity, cost_cents, notes,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  console.log('\npu' + LOT + ': ' + (p.quantity - p.sold) + ' on hand at $' + (p.cost_cents / 100).toFixed(2)
    + '  = $' + (((p.quantity - p.sold) * p.cost_cents) / 100).toFixed(2) + ' going to his friend');
  if (APPLY && !String(p.notes).includes('NOT FOR SALE')) {
    await sql`update purchases set notes = ${String(p.notes ?? '') + NOTE} where id = ${LOT}`;
    console.log('  marked NOT FOR SALE ON EBAY, lot stays until he confirms payment');
  }
  await sql.end();
})();
