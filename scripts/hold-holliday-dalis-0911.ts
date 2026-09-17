/**
 * Two holds off the 2026-09-10 Bowman Chrome box.
 *
 *   npx tsx scripts/hold-holliday-dalis-0911.ts --apply
 *
 * Holliday SF-16: Michael is keeping it to get signed in person next year when
 * Holliday reaches the Spokane Indians, the Rockies High-A club. End the
 * listing and move it to PC.
 *
 * Dalis CPA-WD: Michael ended this one himself on eBay, so the vault still had
 * it as listed. Reconcile the row to match reality. He is holding it to sell
 * alongside his IP-signed Dalis (row 192, BCP-150 Mojo Refractor + IP Auto) as
 * a package, which is the pairing he described: the in-person signed original
 * and the Topps certified auto of the reissue.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}}return undefined;}

const HOLLIDAY = 568, DALIS = 566;

(async () => {
  const rows: any[] = await sql`SELECT id, player, ebay_item_id, notes FROM baseball_cards
    WHERE id IN (${HOLLIDAY}, ${DALIS})`;
  rows.forEach(r => console.log('  id ' + r.id + '  ' + r.player + '  item ' + (r.ebay_item_id || '-')));
  if (!APPLY) { console.log('DRY RUN, pass --apply'); await sql.end(); return; }

  const cfg = JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const t = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();

  // postgres.js returns bigint ids as STRINGS, so a === against a number
  // silently finds nothing. That skipped the end call on the first run and left
  // the listing live while the vault already said PC, which is exactly the
  // overcommit this codebase has been bitten by before. Compare as strings.
  const hol = rows.find(r => String(r.id) === String(HOLLIDAY));
  if (hol?.ebay_item_id) {
    const xml='<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      +'<ErrorLanguage>en_US</ErrorLanguage><ItemID>'+hol.ebay_item_id+'</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>';
    const x = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{
      'X-EBAY-API-CALL-NAME':'EndFixedPriceItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193',
      'X-EBAY-API-IAF-TOKEN':t.access_token,'Content-Type':'text/xml'},body:xml})).text();
    console.log('ended Holliday ' + hol.ebay_item_id + ': ' + (x.match(/<Ack>(\w+)</)?.[1]));
  }
  await sql`UPDATE baseball_cards SET for_sale = false, status = 'photographed',
      ebay_item_id = NULL, ebay_offer_id = NULL, ebay_sku = NULL, asking_price_cents = NULL,
      notes = notes || ${' | PC hold: keeping to get signed in person when Holliday reaches the Spokane Indians, the Rockies High-A club. Pulled from sale 2026-09-11.'},
      updated_at = now() WHERE id = ${HOLLIDAY}`;

  // Dalis: Michael ended it on eBay himself, so only the vault needs correcting
  await sql`UPDATE baseball_cards SET status = 'priced',
      ebay_item_id = NULL, ebay_offer_id = NULL, ebay_sku = NULL,
      notes = notes || ${' | Held 2026-09-11 to sell as a package with the IP-signed Dalis BCP-150 (row 192). Michael ended the single listing himself after it drew views, watchers and a buyer message.'},
      updated_at = now() WHERE id = ${DALIS}`;

  const after: any[] = await sql`SELECT id, player, card_number, parallel, status, for_sale,
      asking_price_cents c, ebay_item_id FROM baseball_cards WHERE id IN (${HOLLIDAY}, ${DALIS}, 192) ORDER BY id`;
  console.log('\nafter:');
  after.forEach(r => console.log('  id ' + String(r.id).padEnd(4) + (r.card_number||'-').padEnd(9) +
    r.player.padEnd(16) + r.status.padEnd(14) + (r.for_sale ? 'for sale' : 'PC') +
    '  $' + ((r.c||0)/100).toFixed(2) + '  item ' + (r.ebay_item_id||'none')));
  await sql.end();
})();
