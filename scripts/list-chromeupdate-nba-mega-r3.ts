/**
 * 2025-26 Topps Chrome Update Basketball Mega Box, third listing generation.
 *
 *   npx tsx scripts/list-chromeupdate-nba-mega-r3.ts            # dry run
 *   npx tsx scripts/list-chromeupdate-nba-mega-r3.ts --publish  # go live + map
 *
 * WHY A THIRD SKU. R2's GTC listing (168596735852) sold out and eBay ENDED it.
 * The Inventory API then happily accepted a quantity bump and a publish, and
 * reported status PUBLISHED / listingStatus ACTIVE / $149.99 - all false. The
 * Trading API GetItem on the same item id showed the truth: ListingStatus
 * "Completed", TimeLeft PT0S, HideFromSearch true, still $129.99. Michael saw
 * nothing on the site, which is what "no dice" meant.
 *
 * This is the SECOND time the Inventory API has misreported a sold-out GTC
 * listing as revivable (R1 -> R2 was the first, same symptom). Treat a
 * sold-out GTC listing as dead: mint a new SKU rather than trying to restock
 * the old offer, and VERIFY every publish with Trading GetItem, never with the
 * Inventory API's own view of what it just did.
 *
 * The cost of a new SKU is the watcher list and the 3-sold history. There is
 * no way to keep those once eBay ends the listing.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
import { quantityForPublish } from './lib/live-qty';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');

const SKU = 'CHROMEUPD-NBA-MEGA-R3';
const CI = 135078;
const COST_CENTS = 9396;
// Michael's call on 2026-08-08: fish above the market on his last box.
// SportsCardsPro sold rows were FLAT, not rising (median $130.00 on 08-06,
// $128.99 on 08-07 across 19 sales), but real sales cleared at $139.99,
// $149.98 and $169.95 in that window, the local shop is at $150, and with a
// single unit there is no inventory pressure. Cut to $134.99 if it sits.
const PRICE = '149.99';
const DESIRED_QTY = 1;
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = '2025-26 Topps Chrome Update Basketball Mega Box SEALED IN HAND Flagg';

const DESCRIPTION = [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  '<p>Factory-sealed 2025-26 Topps Chrome Update Series Basketball Mega Box.</p>',
  '<p>7 packs per box, 6 cards per pack (42 cards total). Look for NBA Debut Patch Autographs, color RayWave parallels, and the Paradox and Glass Canvas case hits. Rookie class led by Cooper Flagg, with Victor Wembanyama on the box.</p>',
  '<p>Brand new, unopened. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const IMAGES = [
  BASE + 'ToppsChromeUpdateNBA_MegaBox_01_front.JPEG',
  BASE + 'ToppsChromeUpdateNBA_MegaBox_02_back.JPEG',
];

const UPC = '887521161485';

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const inventoryItem = {
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    // Michael weighed a packed one at 11.8 oz. Do not guess this.
    weight: { value: 12, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: DESIRED_QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Topps',
    mpn: 'Does Not Apply',
    upc: [UPC],
    aspects: {
      Sport: ['Basketball'],
      League: ['National Basketball Association (NBA)'],
      Autographed: ['No'],
      Set: ['2025-26 Topps Chrome Update'],
      Configuration: ['Box'],
      'Number of Cards': ['42'],
      Manufacturer: ['Topps'],
      'Number of Boxes': ['1'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
    },
    imageUrls: IMAGES,
  },
};

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

/**
 * Ask the Trading API what a listing actually is. The Inventory API's own
 * report of a publish it just performed is not evidence - it has been wrong
 * twice on this exact SKU family.
 */
async function trueListingState(tok: string, itemId: string) {
  const r = await fetch(
    `https://api.ebay.com/ws/api.dll`,
    {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'text/xml',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`,
    }
  );
  const xml = await r.text();
  const pick = (t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '?';
  return { status: pick('ListingStatus'), timeLeft: pick('TimeLeft'), price: pick('CurrentPrice'), hidden: pick('HideFromSearch') };
}

async function main() {
  const [h] = await sql`
    SELECT
      (SELECT COALESCE(SUM(quantity),0) FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL)
    - (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
       WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL) AS held`;

  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} | vault held ${h.held}`);
  const net = Number(PRICE) * 0.847;
  console.log(`  net ~$${net.toFixed(2)} | cost $${(COST_CENTS / 100).toFixed(2)} | +$${(net - COST_CENTS / 100).toFixed(2)} (${(((net - COST_CENTS / 100) / (COST_CENTS / 100)) * 100).toFixed(0)}% ROI)`);

  assertPreflight(SKU, await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(Number(PRICE) * 100),
    costCentsPerUnit: COST_CENTS, unitsPerListing: 1,
    upc: [UPC], imageUrls: IMAGES,
  }));

  if (!PUBLISH) { console.log('\ndry run - pass --publish to go live'); await sql.end(); return; }

  const tok = await userToken();

  // Fresh SKU, so there is no prior eBay sale to reconcile against.
  const g = await quantityForPublish({
    sku: SKU, desiredQty: DESIRED_QTY, heldQty: Number(h.held), loggedSales: 0,
    getOffer: async () => null,
  });
  console.log(`qty ${g.qty} ${g.note}`);
  if (g.blocked || g.qty < 1) { await sql.end(); process.exit(1); }

  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, {
    ...inventoryItem,
    availability: { shipToLocationAvailability: { quantity: g.qty } },
  });

  let offerId: string;
  try {
    const ex = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
    offerId = ex.offers[0].offerId;
  } catch {
    offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', {
      sku: SKU,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: g.qty,
      categoryId: '261332',
      merchantLocationKey: 'edmonds-wa',
      listingDescription: DESCRIPTION,
      listingDuration: 'GTC',
      listingPolicies: {
        paymentPolicyId: '269110704012',
        returnPolicyId: '269110705012',
        fulfillmentPolicyId: '269110723012', // Ground Advantage Calculated
        eBayPlusIfEligible: false,
      },
      pricingSummary: { price: { value: PRICE, currency: 'USD' } },
      tax: { applyTax: false },
    })).offerId;
  }

  // A 500 here has twice been a lie - the publish applied anyway. So swallow
  // the error and let the Trading API verification below be the judge.
  let itemId = '';
  try {
    itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`publish returned an error, checking whether it applied anyway: ${String(e).slice(0, 120)}`);
    const back = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
    itemId = String(back.offers[0]?.listing?.listingId ?? '');
    if (!itemId) { console.error('publish genuinely failed'); await sql.end(); process.exit(1); }
  }

  const t = await trueListingState(tok, itemId);
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API says: status ${t.status}, timeLeft ${t.timeLeft}, price $${t.price}, hiddenFromSearch ${t.hidden}`);
  if (t.status !== 'Active') {
    console.error('  NOT ACTUALLY LIVE - do not report this as listed');
    await sql.end();
    process.exit(1);
  }

  const exists = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
  if (exists.length === 0) {
    const [u] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
    await sql`
      INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
      VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: CI }])})`;
    console.log(`mapped 1x ci${CI} per unit sold`);
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
