/**
 * 2025-26 Topps Chrome Update NBA twofers, both SKUs in one script.
 *
 * Replaces the two near-duplicate scripts that previously handled these.
 * Prices cut 2026-08-06 evening on Michael's "priced to sell tonight": mega
 * $259.99 -> $239.99 ($120/box, bottom quartile of the day's 30 sales) and
 * value $129.99 -> $119.99 (no sold comp for that SKU, so it moves with the
 * mega). Urgency is real: once the Cooper Flagg 1/1 debut patch auto is pulled
 * and posted, the sealed chase premium deflates.
 *
 *   npx tsx scripts/list-chromeupdate-nba-twofers.ts            # dry run
 *   npx tsx scripts/list-chromeupdate-nba-twofers.ts --publish
 *
 * Each twofer consumes BOTH boxes of its kind, so the matching single-box
 * listing must not be live at the same time. The script withdraws it first.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

type Twofer = {
  sku: string; singleSku: string; catalogItemId: number;
  price: string; costEach: number; upc: string;
  title: string; numberOfCards: string; weightOz: number;
  body: string; photos: string[];
};

const ITEMS: Twofer[] = [
  {
    sku: 'CHROMEUPD-NBA-MEGA-2X', singleSku: 'CHROMEUPD-NBA-MEGA', catalogItemId: 135078,
    price: '239.99', costEach: 86.74, upc: '887521161485',
    title: '2025-26 Topps Chrome Update Basketball Mega Box SEALED IN HAND Lot of 2',
    numberOfCards: '84', weightOz: 32,
    body: '7 packs per box, 6 cards per pack (42 cards per box, 84 across the two). Look for NBA Debut Patch Autographs, color RayWave parallels, and the Paradox and Glass Canvas case hits. Rookie class led by Cooper Flagg, with Victor Wembanyama on the box.',
    photos: ['ToppsChromeUpdateNBA_MegaBox_twofer_01_front_sq.JPEG', 'ToppsChromeUpdateNBA_MegaBox_twofer_02_back_sq.JPEG'],
  },
  {
    sku: 'CHROMEUPD-NBA-VALUE-2X', singleSku: 'CHROMEUPD-NBA-VALUE', catalogItemId: 135079,
    price: '119.99', costEach: 45.92, upc: '887521161430',
    title: '2025-26 Topps Chrome Update Basketball Value Box SEALED IN HAND Lot of 2',
    numberOfCards: '56', weightOz: 24,
    body: '7 packs per box, 4 cards per pack (28 cards per box, 56 across the two). Look for NBA Debut Patch Autographs, Basketball and Red White and Blue Refractors, and the Paradox and Glass Canvas case hits. Rookie class led by Cooper Flagg, with Victor Wembanyama on the box.',
    photos: ['ToppsChromeUpdateNBA_ValueBox_twofer_01_front_sq.JPEG', 'ToppsChromeUpdateNBA_ValueBox_twofer_02_back_sq.JPEG'],
  },
];

const PER_UNIT = 2;

const describe = (it: Twofer) => [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  `<p>2x factory-sealed 2025-26 Topps Chrome Update Series Basketball ${/Mega/.test(it.title) ? 'Mega' : 'Value'} Boxes, shipped together in one package.</p>`,
  `<p>${it.body}</p>`,
  '<p>Brand new, unopened. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const inventoryFor = (it: Twofer) => ({
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    dimensions: { length: 10, width: 8, height: 5, unit: 'INCH' },
    weight: { value: it.weightOz, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: 1 } },
  product: {
    title: it.title,
    description: describe(it),
    brand: 'Topps',
    mpn: 'Does Not Apply',
    // UPC off the box back. Omitting it on day one cost these listings their
    // eBay catalog match and they drew zero views. preflight now blocks that.
    upc: [it.upc],
    aspects: {
      Sport: ['Basketball'],
      League: ['National Basketball Association (NBA)'],
      Autographed: ['No'],
      Set: ['2025-26 Topps Chrome Update'],
      Configuration: ['Box'],
      'Number of Cards': [it.numberOfCards],
      Manufacturer: ['Topps'],
      'Number of Boxes': ['2'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
    },
    imageUrls: it.photos.map((p) => BASE + p),
  },
});

const offerFor = (it: Twofer) => ({
  sku: it.sku,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: 1,
  categoryId: '261332',
  merchantLocationKey: 'edmonds-wa',
  listingDescription: describe(it),
  listingDuration: 'GTC',
  listingPolicies: {
    paymentPolicyId: '269110704012',
    returnPolicyId: '269110705012',
    fulfillmentPolicyId: '269110723012',
    eBayPlusIfEligible: false,
  },
  pricingSummary: { price: { value: it.price, currency: 'USD' } },
  tax: { applyTax: false },
});

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  for (const it of ITEMS) {
    const net = Number(it.price) * 0.864 - 0.3;
    const cost = PER_UNIT * it.costEach;
    console.log(`${it.title}`);
    console.log(`  ${it.title.length} chars | $${it.price} | net $${net.toFixed(2)} | cost $${cost.toFixed(2)} | +$${(net - cost).toFixed(2)}`);
    assertPreflight(it.sku, await preflight({
      sku: it.sku, title: it.title, priceCents: Math.round(Number(it.price) * 100),
      costCentsPerUnit: Math.round(it.costEach * 100), unitsPerListing: PER_UNIT,
      upc: it.upc, imageUrls: it.photos.map((p) => BASE + p),
    }));
  }

  if (!PUBLISH) { console.log('\ndry run - pass --publish'); await sql.end(); return; }

  const tok = await userToken();
  const [u] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;

  for (const it of ITEMS) {
    // The single-box listing must be down; a twofer takes both boxes.
    try {
      const s = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${it.singleSku}`);
      const so = s?.offers?.[0];
      if (so?.status === 'PUBLISHED') {
        await api(tok, 'POST', `/sell/inventory/v1/offer/${so.offerId}/withdraw`);
        await sql`DELETE FROM ebay_listing_mappings WHERE ebay_item_id=${String(so.listing.listingId)}`;
        console.log(`withdrew single ${so.listing.listingId} (${it.singleSku})`);
      }
    } catch (e) {
      if (!String(e).includes('-> 404')) throw e;
    }

    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${it.sku}`, inventoryFor(it));
    let offerId: string;
    try {
      const ex = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${it.sku}`);
      offerId = ex.offers[0].offerId;
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerFor(it));
    } catch {
      offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerFor(it))).offerId;
    }
    const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
    const itemId = String(pub.listingId);
    console.log(`  ${it.sku} live: ${itemId}  https://www.ebay.com/itm/${itemId}`);

    const exists = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
    if (exists.length === 0) {
      await sql`
        INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
        VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: PER_UNIT, catalogItemId: it.catalogItemId }])})`;
      console.log(`  mapped ${PER_UNIT}x ci${it.catalogItemId} per unit sold`);
    }
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
