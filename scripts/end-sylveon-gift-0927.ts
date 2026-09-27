/**
 * End the Sylveon ex box listing. The last one is a Christmas present.
 *
 *   npx tsx scripts/end-sylveon-gift-0927.ts --apply
 *
 * "I want to take my scalper hat off for a minute give my nephew my sylveon box
 * for Christmas. How much was that msrp again?" -> "End it"
 *
 * pu627 held 2 at $33.14 (Fred Meyer Shoreline, $29.99 MSRP plus 10.50%). One
 * sold 2026-09-23 for $61.99, +$19.45. The second was still live at $61.99 with
 * ELEVEN WATCHERS, which is the part that mattered: the present was one click
 * from being sold out from under him overnight.
 *
 * Ending does not touch the completed sale; QuantitySold stays 1.
 *
 * THE UNIT STAYS IN THE VAULT. This is not a giveaway yet - he has not handed
 * it over, Christmas is months out. The standing rule is to decrement a lot
 * when he says he GAVE something away, not when he plans to. What goes in now
 * is a note on the lot, so the next audit that sees an unlisted Sylveon on hand
 * does not helpfully offer to relist his nephew's present.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168705237986';
const LOT = 627;
const NOTE = ' | NOT FOR SALE: the remaining box is a Christmas present for his nephew '
  + '(2026-09-27). Listing 168705237986 was ended the same night to protect it, at $61.99 '
  + 'with 11 watchers. Do not relist or include this unit in any lot, and do not decrement '
  + 'the lot until he says he has actually handed it over.';

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
    + '  qty ' + g('Quantity') + '  sold ' + g('QuantitySold') + '   ' + g('Title').slice(0, 60));
  if (g('ListingStatus') !== 'Active') { console.log('  not active, nothing to end'); }
  else if (APPLY) {
    const r = await call('EndFixedPriceItem',
      '<ItemID>' + ITEM + '</ItemID><EndingReason>NotAvailable</EndingReason>');
    console.log('  end ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 160));
    const post = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('after:  ' + g('ListingStatus', post) + '  sold ' + g('QuantitySold', post)
      + '  (the completed 09-23 sale is untouched)');
  } else console.log('  dry run');

  const [p] = await sql`select id, quantity, cost_cents, notes,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  console.log('\npu' + LOT + ': ' + (p.quantity - p.sold) + ' on hand at $' + (p.cost_cents / 100).toFixed(2));
  if (APPLY && !String(p.notes).includes('NOT FOR SALE')) {
    await sql`update purchases set notes = ${String(p.notes ?? '') + NOTE} where id = ${LOT}`;
    console.log('  marked NOT FOR SALE, unit stays in the vault until he hands it over');
  }
  await sql.end();
})();
