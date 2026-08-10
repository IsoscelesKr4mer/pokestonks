import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function tok() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!) + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  return j.access_token as string;
}
async function get(t: string, id: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'967','X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-IAF-TOKEN':t,'Content-Type':'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await r.text();
  const p = (tag: string) => x.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '?';
  const price = x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? '?';
  return { id, status: p('ListingStatus'), title: p('Title').slice(0, 62), sku: p('SKU'), qty: p('Quantity'), sold: p('QuantitySold'), price };
}
async function main() {
  const t = await tok();
  const ids = ['168591612747','168446042994','168462181168','168483384016','168519091676','168387956289','168448278140','168400230154','168570958691'];
  for (const id of ids) {
    const s = await get(t, id);
    console.log(`${s.id} ${s.status.padEnd(9)} qty ${String(s.qty).padStart(2)} sold ${String(s.sold).padStart(2)} $${String(s.price).padStart(7)} ${s.sku.padEnd(22)} ${s.title}`);
  }
}
main().catch(e => { console.error(String(e).slice(0,400)); process.exit(1); });
