/**
 * List the two 2026 Everett AquaSox retro jersey SGAs (8/16 giveaway, size L):
 * one still sealed in the bag, one signed in person by Reid Easterly.
 *
 *   npx tsx scripts/list-aquasox-retro-jerseys.ts          # dry run
 *   npx tsx scripts/list-aquasox-retro-jerseys.ts --apply  # upload, create, publish
 *
 * Category is 24441 "Baseball-Minors", NOT the 24410 "Baseball-MLB" used for the
 * Mariners pin and the bobbleheads. The AquaSox are MiLB and eBay's own category
 * suggestions put minor-league apparel in 24441, which is where the comps live.
 *
 * Verified facts only (see listings_v2 for sources): the 8/16/2026 giveaway was a
 * replica retro jersey to the FIRST 1,000 FANS, one per person, co-branded for
 * Community Transit's 50th anniversary. The "50" on the back is Community
 * Transit's 50 years, NOT a player number — Easterly wears #22.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'ebay-listings';
const DIR = 'eBay_assets/v2_photos';

type Listing = {
  sku: string; price: string; title: string; desc: string; photos: string[];
};

const COMMON = 'Ships within 1 business day. Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.';
const PROVENANCE = 'Stadium giveaway (SGA) from the 2026-08-16 Everett AquaSox game at Everett Memorial Stadium, handed out to the first 1,000 fans through the gate, one per person. The jersey is co-branded for Community Transit\'s 50th anniversary: "COMMUNITY TRANSIT" down the back and a large 50. Note the 50 is the anniversary, not a player number.';

const LISTINGS: Listing[] = [
  {
    sku: 'JERSEY-AQUASOX-RETRO-2026-L-SEALED',
    price: '39.99',
    title: '2026 Everett AquaSox Retro Jersey SGA 8/16 Limited 1000 Sealed Large Mariners',
    desc: [
      'Everett AquaSox replica retro jersey, adult size Large, brand new and still sealed in the original factory bag. Never opened.',
      PROVENANCE,
      'Navy button-front jersey with the AquaSox wordmark and tree-frog mascot on the chest and teal sleeve trim. 100% polyester. The AquaSox are the Seattle Mariners High-A affiliate.',
      COMMON,
    ].join(' '),
    photos: ['AquaSox_RetroJersey_2026_Sealed_01_bagged.jpg'],
  },
  {
    sku: 'JERSEY-AQUASOX-RETRO-2026-L-EASTERLY',
    price: '49.99',
    title: 'Reid Easterly Signed 2026 Everett AquaSox Retro Jersey SGA 8/16 Large Mariners',
    desc: [
      'Everett AquaSox replica retro jersey, adult size Large, signed in person by AquaSox left-handed pitcher Reid Easterly.',
      'Signed at Signature Sunday on the stadium concourse on 2026-08-16, the same day the jersey was given away. I was there and got it signed myself.',
      PROVENANCE,
      'Easterly is a Duke product who signed with the Mariners as an undrafted free agent and reached High-A Everett in his first full pro season. He was named a Mariners Minor League Award winner for July 2026.',
      'Navy button-front jersey with the AquaSox wordmark and tree-frog mascot on the chest and teal sleeve trim. 100% polyester. Brand new and never worn; it came out of the bag only to be signed.',
      COMMON,
    ].join(' '),
    photos: [
      'AquaSox_RetroJersey_2026_Easterly_01_front.jpg',
      'AquaSox_RetroJersey_2026_Easterly_02_back_signed.jpg',
    ],
  },
];

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function upload(name: string) {
  const buf = readFileSync(`${DIR}/${name}`);
  const { error } = await supa.storage.from(BUCKET).upload(name, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`${name}: ${error.message}`);
  return supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

async function main() {
  for (const l of LISTINGS) {
    console.log(`\n${l.sku}  $${l.price}`);
    console.log(`  title (${l.title.length}): ${l.title}`);
    console.log(`  photos: ${l.photos.join(', ')}`);
    console.log(`  ${l.desc}`);
  }
  if (!APPLY) { console.log('\ndry run, nothing uploaded or published.'); return; }

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

  for (const l of LISTINGS) {
    const imageUrls: string[] = [];
    for (const p of l.photos) imageUrls.push(await upload(p));

    const signed = l.sku.endsWith('EASTERLY');
    const item = {
      sku: l.sku, locale: 'en_US', condition: 'NEW',
      // Polyester jersey in a poly mailer. Comps charged $7.77-$9.55 delivery.
      packageWeightAndSize: {
        dimensions: { length: 12, width: 9, height: 2, unit: 'INCH' },
        weight: { value: 12, unit: 'OUNCE' },
      },
      availability: { shipToLocationAvailability: { quantity: 1 } },
      product: {
        title: l.title, description: l.desc,
        aspects: {
          Product: ['Jersey'], Team: ['Everett AquaSox'], Sport: ['Baseball'],
          Size: ['L'], 'Country/Region of Manufacture': ['China'],
          ...(signed
            ? { Player: ['Reid Easterly'], Autographed: ['Yes'], 'Original/Reproduction': ['Original'] }
            : { Autographed: ['No'] }),
        },
        imageUrls,
      },
    };
    const ir = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${l.sku}`, {
      method: 'PUT', headers: auth, body: JSON.stringify(item),
    });
    console.log(`${l.sku} inventory PUT`, ir.status, ir.status >= 300 ? await ir.text() : '');
    if (ir.status >= 300) continue;

    const offer = {
      sku: l.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '24441', merchantLocationKey: 'edmonds-wa', listingDescription: l.desc,
      // BIN only, per his standing rule on the SGA flips.
      listingPolicies: {
        paymentPolicyId: '269110704012', returnPolicyId: '269110705012',
        fulfillmentPolicyId: '269110723012', eBayPlusIfEligible: false,
      },
      pricingSummary: { price: { value: l.price, currency: 'USD' } },
      tax: { applyTax: false },
    };
    const or = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
      method: 'POST', headers: auth, body: JSON.stringify(offer),
    });
    const oj = await or.json();
    console.log(`${l.sku} offer POST`, or.status, JSON.stringify(oj).slice(0, 400));
    if (!oj.offerId) continue;

    const pr = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${oj.offerId}/publish`, {
      method: 'POST', headers: auth,
    });
    const pj = await pr.json();
    console.log(`${l.sku} publish`, pr.status, JSON.stringify(pj).slice(0, 500));
    if (pj.listingId) console.log(`  https://www.ebay.com/itm/${pj.listingId}`);
  }
}

main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
