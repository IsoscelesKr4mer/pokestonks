/**
 * Item 168561672841 is titled "Platinum ... Vibrations Refractor /250" but its
 * live description called the card a "1957 Topps Purple Refractor /250". Two
 * different cards on one listing. Michael confirmed it is the Vibrations.
 *
 * The DB and the inventory item both already had it right --
 * `2025 Topps Chrome Platinum Anniversary`, `Vibrations Refractor /250
 * (181/250)` -- so only the OFFER's listingDescription, which is what buyers
 * actually read, was stale. The card note explains the origin: the 1957-style
 * design was misread early on.
 *
 * Fixes the offer and re-syncs the inventory item, which was still carrying the
 * pre-Card-Saver packaging line. Leaving those two out of step is what let a
 * wrong description sit on a live listing unnoticed.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BBC-2';
const ITEM = '168561672841';

const WRONG = '2025 Topps Chrome 1957 Topps Purple Refractor /250 - Garrett Crochet #84.';
const RIGHT = '2025 Topps Chrome Platinum Anniversary Vibrations Refractor /250 - Garrett Crochet #84, numbered 181/250.';
const PACK_OLD = 'Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking.';
const PACK_NEW = 'Stored in a penny sleeve and toploader. Ships in a toploader or Card Saver I, protected between rigid cardboard, with tracking.';

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US' };

  const offers = await (await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${SKU}`, { headers: h })).json();
  const offer = (offers.offers ?? []).find((o: any) => String(o.listing?.listingId) === ITEM) ?? (offers.offers ?? [])[0];
  if (!offer) { console.error('no offer'); process.exit(1); }

  const fixed = (offer.listingDescription as string).replace(WRONG, RIGHT);
  if (fixed === offer.listingDescription) { console.error('wrong-card sentence not found, aborting rather than guessing'); process.exit(1); }
  console.log(`offer ${offer.offerId}`);
  console.log(`  - ${WRONG}`);
  console.log(`  + ${RIGHT}`);

  const inv = await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { headers: h })).json();
  const invFixed = (inv.product.description as string).replace(PACK_OLD, PACK_NEW);
  console.log(`inventory item packaging line ${invFixed === inv.product.description ? 'already current' : 'resynced'}`);

  if (!APPLY) { console.log('\ndry run'); return; }

  const body = { ...offer };
  delete body.offerId; delete body.listing; delete body.status;
  body.listingDescription = fixed;
  const up = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
  console.log(`offer PUT ${up.status}${up.status >= 300 ? ' ' + (await up.text()).slice(0, 300) : ''}`);

  inv.product.description = invFixed;
  delete inv.sku;
  const iu = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { method: 'PUT', headers: h, body: JSON.stringify(inv) });
  console.log(`inventory PUT ${iu.status}${iu.status >= 300 ? ' ' + (await iu.text()).slice(0, 300) : ''}`);

  const xml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  const t = await (await fetch('https://api.ebay.com/ws/api.dll', { method: 'POST', headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'Content-Type': 'text/xml' }, body: xml })).text();
  const d = (t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  console.log(`\nlive now: ${d.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  console.log(`1957 still present: ${/1957/.test(d)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
