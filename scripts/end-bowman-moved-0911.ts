/**
 * End the individual listings for cards that move into the dropdown under
 * Michael's rule B: hits and inserts stand alone, base and prospects go in the
 * you-pick. Rujano BCP-177 and Renteria BCP-163 were only standalone because
 * of the old $10 price threshold.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}}return undefined;}
(async () => {
  const plan = JSON.parse(readFileSync('scripts/_bow_individual.json','utf8'));
  const keep = new Set(plan.map((p:any)=>p.sku));
  const live: any[] = await sql`SELECT id, player, card_number, ebay_sku, ebay_item_id, ebay_offer_id
    FROM baseball_cards WHERE ebay_sku LIKE 'BOWCH-%' AND ebay_sku NOT LIKE 'BOWCH-YP-%'
      AND ebay_item_id IS NOT NULL`;
  const drop = live.filter(r => !keep.has(r.ebay_sku));
  console.log('live individual listings: ' + live.length + ' | to end: ' + drop.length);
  drop.forEach(r => console.log('   ' + r.ebay_item_id + '  ' + r.ebay_sku + '  ' + r.player + ' ' + r.card_number));
  if (!drop.length || !APPLY) { if(!APPLY) console.log('DRY RUN, pass --apply'); await sql.end(); return; }

  const cfg = JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const t = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  for (const r of drop) {
    const xml = '<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><ItemID>'+r.ebay_item_id+'</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>';
    const x = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{
      'X-EBAY-API-CALL-NAME':'EndFixedPriceItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193',
      'X-EBAY-API-IAF-TOKEN':t.access_token,'Content-Type':'text/xml'},body:xml})).text();
    const ack = x.match(/<Ack>(\w+)</)?.[1];
    console.log('ended ' + r.ebay_item_id + ' (' + r.player + '): ' + ack);
    if (ack === 'Success' || ack === 'Warning') {
      await sql`UPDATE baseball_cards SET ebay_item_id=NULL, ebay_offer_id=NULL, ebay_sku=NULL,
        status='priced', updated_at=now() WHERE id=${r.id}`;
    }
  }
  await sql.end();
})();
