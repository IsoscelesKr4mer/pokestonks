/**
 * List the '10s Mariners 50 Seasons pin (SGA 2026-08-23), qty 10 at $19.99.
 *
 *   npx tsx scripts/list-mariners-50seasons-pin.ts          # dry run
 *   npx tsx scripts/list-mariners-50seasons-pin.ts --apply  # upload, create, publish
 *
 * Same SGA recipe as scripts/list-bobbleheads.ts (category 24410, condition NEW,
 * Ground Advantage calculated, BIN only) with one difference that matters: a pin
 * is a 3 oz padded envelope, not a 2 lb boxed bobblehead, so packageWeightAndSize
 * is tiny. Declaring the bobblehead's 2 lb 9x6x6 would quote the buyer ~$9
 * instead of ~$5 and cost sales on a $19.99 item.
 *
 * Category note: eBay also suggests 50130 "Pins", but that sits under VINTAGE
 * Sports Memorabilia. Same trap as 73424 for the bobbleheads. Modern SGA comps
 * live in 24410 (Fan Apparel & Souvenirs > Baseball-MLB).
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'ebay-listings';

const PHOTOS: [string, string][] = [
  ['eBay_assets/v2_photos/Mariners_50Seasons_Pin_10s_Felix_01_front.jpg', 'Mariners_50Seasons_Pin_10s_Felix_01_front.jpg'],
];

const SKU = 'PIN-MARINERS-50S-10S-FELIX';
const PRICE = '19.99';
const QTY = 10;
const TITLE = "Seattle Mariners 50 Seasons Pin 6/7 '10s King Felix Hernandez K SGA 2026 New";

const DESC = [
  "Seattle Mariners '10s decade pin, number 6 of 7 in the 50 Seasons pin series, presented by KeyBank.",
  'Stadium giveaway (SGA) from the 2026-08-23 game at T-Mobile Park.',
  'The design is the yellow King\'s Court "K", the strikeout card Mariners fans held up for Felix Hernandez.',
  'Brand new, still sealed in the original poly bag on its printed backer card, exactly as handed out at the gate.',
  'Ships within 1 business day. Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.',
].join(' ');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function upload(src: string, name: string) {
  const buf = readFileSync(src);
  const { error } = await supa.storage.from(BUCKET).upload(name, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`${name}: ${error.message}`);
  return supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

async function main() {
  console.log(`title (${TITLE.length} chars): ${TITLE}`);
  console.log(`$${PRICE} x ${QTY} · category 24410 · SKU ${SKU} · BIN only, no Best Offer`);
  if (!APPLY) { console.log(`\ndry run\n\n${DESC}`); return; }

  const imageUrls: string[] = [];
  for (const [src, name] of PHOTOS) imageUrls.push(await upload(src, name));
  console.log('photos:', imageUrls.join(' '));

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = {
    Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
    'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
  };

  const item = {
    sku: SKU, locale: 'en_US', condition: 'NEW',
    // Pin on a backer card in a padded envelope. NOT the bobblehead's 2 lb box.
    packageWeightAndSize: {
      dimensions: { length: 6, width: 4, height: 1, unit: 'INCH' },
      weight: { value: 3, unit: 'OUNCE' },
    },
    availability: { shipToLocationAvailability: { quantity: QTY } },
    product: {
      title: TITLE, description: DESC,
      aspects: {
        Product: ['Pin'], Player: ['Felix Hernandez'], Team: ['Seattle Mariners'],
        League: ['Major League Baseball (MLB)'], Sport: ['Baseball'], 'Officially Licensed': ['Yes'],
      },
      imageUrls,
    },
  };
  const ir = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, {
    method: 'PUT', headers: auth, body: JSON.stringify(item),
  });
  console.log('inventory PUT', ir.status, ir.status >= 300 ? await ir.text() : '');
  if (ir.status >= 300) process.exit(1);

  const offer = {
    sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: QTY,
    categoryId: '24410', merchantLocationKey: 'edmonds-wa', listingDescription: DESC,
    // BIN only. No bestOfferTerms, per his standing rule on the SGA flips.
    listingPolicies: {
      paymentPolicyId: '269110704012', returnPolicyId: '269110705012',
      fulfillmentPolicyId: '269110723012', eBayPlusIfEligible: false,
    },
    pricingSummary: { price: { value: PRICE, currency: 'USD' } },
    tax: { applyTax: false },
  };
  const or = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST', headers: auth, body: JSON.stringify(offer),
  });
  const oj = await or.json();
  console.log('offer POST', or.status, JSON.stringify(oj).slice(0, 400));
  if (!oj.offerId) process.exit(1);

  const pr = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${oj.offerId}/publish`, {
    method: 'POST', headers: auth,
  });
  const pj = await pr.json();
  console.log('publish', pr.status, JSON.stringify(pj).slice(0, 500));
  if (pj.listingId) console.log(`\nhttps://www.ebay.com/itm/${pj.listingId}`);
}

main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
