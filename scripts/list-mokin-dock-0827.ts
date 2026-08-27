/**
 * MOKiN MOTBO101 Thunderbolt 4 dock. Everything EXCEPT publish.
 *
 *   npx tsx scripts/list-mokin-dock-0827.ts --apply     # photos + inventory + offer, NOT live
 *   npx tsx scripts/list-mokin-dock-0827.ts --publish   # only after Michael says publish
 *
 * Not a vault item, so no catalog_item and no ebay_listing_mappings row.
 *
 * The description states plainly that triple-display needs Windows and that
 * Apple Silicon gets one external display. That is not a defect and not a
 * disclosure of damage: no Apple Silicon Mac supports DisplayPort MST, which is
 * how this dock drives its extra displays, and MOKiN's own spec limits Mac
 * dual-screen to Intel and Pro/Max chips. Saying so up front costs nothing with
 * the Windows buyers this dock is actually good for, and prevents the return.
 *
 * GTIN is deliberately absent: the only barcode on the box is an Amazon code
 * (X003UZTKEZ), not a UPC. Do not invent one.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SKU = 'MOKIN-MOTBO101-TB4';
const PRICE = '124.99';
const CATEGORY = '3709';
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '269110723012' };
const TITLE = 'MOKiN MOTBO101 Thunderbolt 4 Docking Station 40Gbps 8K Dual Monitor 2.5GbE SD4.0';

const INBOX = `${homedir()}/.claude/channels/discord/inbox`;
const PHOTOS: [string, string][] = [
  [`${INBOX}/1787868767834-1542658125096558663.jpg`, 'MOKiN_MOTBO101_01_kit.jpg'],
  [`${INBOX}/1787868768430-1542658126002655293.jpg`, 'MOKiN_MOTBO101_02_box_front.jpg'],
  [`${INBOX}/1787868768698-1542658126363361341.jpg`, 'MOKiN_MOTBO101_03_spec_label.jpg'],
  [`${INBOX}/1787868768152-1542658125507592322.jpg`, 'MOKiN_MOTBO101_04_box_contents.jpg'],
];

const DESC = [
  '<p><strong>MOKiN Thunderbolt 4 Docking Station, model MOTBO101.</strong> Open box, never put into service. Complete with the 150W power adapter, AC cord, Thunderbolt 4 cable and original box. No instruction manual.</p>',
  '<p><strong>Specifications, from the box:</strong></p>',
  '<ul>',
  '<li>Thunderbolt 4, up to 40Gbps. Compatible with Thunderbolt 3, USB4 and DP Alt mode</li>',
  '<li>DisplayPort up to 8K/30Hz, 4K at 60/120/144Hz, 1080p at 60/120/144/240Hz</li>',
  '<li>USB 3.2, up to 10Gbps, backward compatible</li>',
  '<li>SD 4.0 and microSD 4.0, up to 312MB/s, both slots usable at once</li>',
  '<li>RJ45 Ethernet, 10M/100M/1000M/2.5G</li>',
  '<li>150W DC power supply included</li>',
  '</ul>',
  '<p><strong>Display support:</strong> triple-display output requires Windows. On Apple Silicon Macs this dock drives one external display. That is a macOS limitation affecting every dock of this type, not a fault with this unit.</p>',
  '<p>Smoke-free home. Ships within 1 business day. Buy with confidence, check my feedback.</p>',
].join('');

const ASPECTS: Record<string, string[]> = {
  Brand: ['MOKiN'],
  Type: ['Docking Station'],
  Model: ['MOTBO101'],
  MPN: ['MOTBO101'],
  Color: ['Silver'],
  Ports: ['Thunderbolt 4', 'USB-C', 'USB-A', 'HDMI', 'RJ45 Ethernet', 'SD Card Reader'],
  'Compatible Brand': ['For Apple', 'For Dell', 'For HP', 'For Lenovo'],
};

// Boxed weight is an ESTIMATE until Michael puts it on a scale: the 150W brick
// dominates it. Shipping is calculated, so a low guess costs him real money.
const PKG = { l: 12, w: 9, h: 4, oz: 64 };

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  console.log(`${TITLE}\n  ${TITLE.length}/80 chars   $${PRICE}   cat ${CATEGORY}   sku ${SKU}`);
  if (TITLE.length > 80) { console.error('TITLE TOO LONG'); process.exit(1); }
  if (!APPLY && !PUBLISH) { console.log('\ndry run'); return; }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' };

  if (PUBLISH) {
    const offers = await (await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${SKU}`, { headers: auth })).json();
    const offerId = offers.offers?.[0]?.offerId;
    if (!offerId) { console.error('no offer for sku'); process.exit(1); }
    const pr = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`, { method: 'POST', headers: auth });
    const pj = await pr.json();
    console.log(`publish ${pr.status} ${JSON.stringify(pj).slice(0, 300)}`);
    if (pj.listingId) console.log(`  https://www.ebay.com/itm/${pj.listingId}`);
    return;
  }

  const urls: string[] = [];
  for (const [src, name] of PHOTOS) {
    const jpg = await sharp(readFileSync(src)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const { error } = await supa.storage.from('ebay-listings').upload(name, jpg, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    urls.push(supa.storage.from('ebay-listings').getPublicUrl(name).data.publicUrl);
    console.log(`photo ${name} ${(jpg.length / 1024).toFixed(0)}KB`);
  }

  const inv = {
    sku: SKU, locale: 'en_US', condition: 'NEW_OTHER',
    conditionDescription: 'Open box. Opened and powered on but never put into regular service. Includes 150W power adapter, AC cord and Thunderbolt 4 cable, with the original retail box. No instruction manual.',
    packageWeightAndSize: { dimensions: { length: PKG.l, width: PKG.w, height: PKG.h, unit: 'INCH' }, weight: { value: PKG.oz, unit: 'OUNCE' } },
    availability: { shipToLocationAvailability: { quantity: 1 } },
    product: { title: TITLE, description: DESC, aspects: ASPECTS, imageUrls: urls },
  };
  const ir = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { method: 'PUT', headers: auth, body: JSON.stringify(inv) });
  console.log(`inventory PUT ${ir.status}${ir.status >= 300 ? ' ' + (await ir.text()).slice(0, 500) : ''}`);
  if (ir.status >= 300) process.exit(1);

  const offer = {
    sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
    categoryId: CATEGORY, merchantLocationKey: 'edmonds-wa', listingDescription: DESC,
    listingPolicies: { paymentPolicyId: POLICIES.payment, returnPolicyId: POLICIES.ret, fulfillmentPolicyId: POLICIES.ship, eBayPlusIfEligible: false },
    pricingSummary: { price: { value: PRICE, currency: 'USD' } },
    tax: { applyTax: false },
  };
  const or = await fetch('https://api.ebay.com/sell/inventory/v1/offer', { method: 'POST', headers: auth, body: JSON.stringify(offer) });
  const oj = await or.json();
  console.log(`offer POST ${or.status} ${JSON.stringify(oj).slice(0, 400)}`);
  console.log('\nNOT PUBLISHED. Run with --publish after Michael says so.');
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
