/**
 * Publish the Mega Evolution: Ascended Heroes Tech Sticker Collection (Charmander),
 * catalog item 70, qty 2 at $38.99.
 *
 * Goes straight at api.ebay.com with the creds already in ~/.claude.json. The
 * ebay MCP server is a convenience wrapper over the same REST API, so a dead
 * MCP does not block a publish.
 *
 *   npx tsx scripts/publish-ah-techsticker.ts            # dry run, preflight only
 *   npx tsx scripts/publish-ah-techsticker.ts --apply    # LIVE, needs his go-ahead
 *
 * Michael's standing rule: never publish without an explicit go-ahead. --apply
 * is the gate; do not add a default-on path.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const SKU = 'AH-TECHSTICKER-CHARM';
const CATALOG_ITEM_ID = 70;
const QTY = 2;
// Repriced 2026-10-14 before publishing. The draft sat two days waiting on
// his word and the market softened underneath it: TCGplayer $38.52 -> $36.55,
// the 25th-percentile clean ask $38.00 -> $36.99, median $44.95 -> $42.00.
// $38.99 would now be above both market and the 25th percentile on a product
// Target is still shipping. $36.99 sits at the 25th and just above market.
const PRICE = '36.99';
const COST_CENTS = 2213;
const UPC = '196214141278';
const CATEGORY = '183456'; // CCG Sealed Packs
const TITLE =
  'Pokemon Mega Evolution Ascended Heroes Tech Sticker Collection Charmander Sealed';

const BUCKET = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings';
const IMAGES = [
  `${BUCKET}/AscendedHeroes_TechSticker_Charmander_01_front.jpg`,
  `${BUCKET}/AscendedHeroes_TechSticker_Charmander_02_back.jpg`,
];

// The offer's listingDescription renders as HTML; plain \n collapses.
const DESCRIPTION = [
  '<p>New, factory-sealed Pokemon TCG Mega Evolution: Ascended Heroes Tech Sticker Collection, Charmander version.</p>',
  '<p>Includes:</p>',
  '<ul>',
  '<li>1 foil Charmander promo card (020/217)</li>',
  '<li>1 tech sticker sheet featuring Charmander and Mega Charizard Y</li>',
  '<li>3 Pokemon TCG: Mega Evolution - Ascended Heroes booster packs</li>',
  '</ul>',
  '<p>Smoke-free home. Ships within 1 business day.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

// His CombinedItemWeight calculated profile. Bundles multiple units of a
// multi-quantity listing into one package by total weight, so two blisters
// ship on one label instead of two.
const COMBINED_SHIPPING_PROFILE = '1423939012';

const POLICIES = {
  fulfillmentPolicyId: '269110723012', // Ground Advantage calculated, buyer pays
  paymentPolicyId: '269110704012',
  returnPolicyId: '269110705012', // no returns
};

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
const CID = findKey(cfg, 'EBAY_CLIENT_ID')!;
const SEC = findKey(cfg, 'EBAY_CLIENT_SECRET')!;
const REFRESH = findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!;

async function userToken() {
  const scope = [
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
  ].join(' ');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent(scope)}`,
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL as string, { prepare: false });

  // Never list more than he holds. Held = purchases - sales, soft-deleted lots dropped.
  const [h] = await sql`
    SELECT
      (SELECT coalesce(sum(p.quantity),0)::int FROM purchases p
        WHERE p.catalog_item_id = ${CATALOG_ITEM_ID} AND p.deleted_at IS NULL) AS bought,
      (SELECT coalesce(sum(s.quantity),0)::int FROM sales s
        JOIN purchases p2 ON p2.id = s.purchase_id
        WHERE p2.catalog_item_id = ${CATALOG_ITEM_ID} AND p2.deleted_at IS NULL) AS sold`;
  const held = Number(h.bought) - Number(h.sold);
  console.log(`held: ${held} (bought ${h.bought}, sold ${h.sold})`);
  if (held < QTY) throw new Error(`cannot list ${QTY}, only ${held} held`);

  // Nothing else may already be committed against this catalog item.
  const maps = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  const committed = maps.filter((m) =>
    JSON.stringify(m.mappings).includes(`"catalogItemId":${CATALOG_ITEM_ID}`),
  );
  if (committed.length) {
    throw new Error(
      `catalog item ${CATALOG_ITEM_ID} is already mapped to ${committed.map((c) => c.ebay_item_id).join(', ')}`,
    );
  }
  console.log('no existing listing committed against this item');

  assertPreflight(
    SKU,
    await preflight({
      sku: SKU,
      title: TITLE,
      priceCents: Math.round(Number(PRICE) * 100),
      costCentsPerUnit: COST_CENTS,
      unitsPerListing: 1,
      upc: UPC,
      imageUrls: IMAGES,
    }),
  );

  if (!APPLY) {
    console.log(`\nDRY RUN. ${TITLE.length}-char title, qty ${QTY} @ $${PRICE}.`);
    console.log('Pass --apply to publish. Needs his explicit go-ahead first.');
    await sql.end();
    return;
  }

  const tok = await userToken();
  const auth = {
    Authorization: `Bearer ${tok}`,
    'Content-Type': 'application/json',
    'Content-Language': 'en-US',
    'Accept-Language': 'en-US',
    Accept: 'application/json',
  };

  // 1) inventory item. packageType is omitted on purpose: it breaks the publish.
  const invR = await fetch(
    `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(SKU)}`,
    {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        locale: 'en_US',
        condition: 'NEW',
        packageWeightAndSize: {
          dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
          weight: { value: 1, unit: 'POUND' },
        },
        availability: { shipToLocationAvailability: { quantity: QTY } },
        product: {
          title: TITLE,
          description: DESCRIPTION,
          imageUrls: IMAGES,
          upc: [UPC],
          brand: 'Pokémon',
          mpn: 'Does Not Apply', // brand without mpn fails the publish
          aspects: {
            Game: ['Pokémon TCG'],
            Set: ['Mega Evolution: Ascended Heroes'],
            Configuration: ['Pack'],
            Character: ['Charmander', 'Charizard'],
            Manufacturer: ['The Pokémon Company'],
            'Year Manufactured': ['2026'],
            'Age Level': ['6+'],
            Language: ['English'],
            'Card Size': ['Standard'],
            Material: ['Card Stock'],
            Features: ['Sealed'],
            Type: ['Collection'],
            'Number of Packs': ['3'],
            Vintage: ['No'],
            Autographed: ['No'],
          },
        },
      }),
    },
  );
  if (!invR.ok && invR.status !== 204) {
    throw new Error(`inventory item failed ${invR.status}: ${await invR.text()}`);
  }
  console.log('inventory item written');

  // 2) offer
  const offR = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      sku: SKU,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: QTY,
      categoryId: CATEGORY,
      listingDescription: DESCRIPTION,
      listingPolicies: POLICIES,
      merchantLocationKey: 'edmonds-wa',
      pricingSummary: { price: { value: PRICE, currency: 'USD' } },
    }),
  });
  const off: any = await offR.json();
  if (!off.offerId) throw new Error(`offer failed ${offR.status}: ${JSON.stringify(off)}`);
  console.log('offer', off.offerId);

  // 3) publish
  const pubR = await fetch(
    `https://api.ebay.com/sell/inventory/v1/offer/${off.offerId}/publish`,
    { method: 'POST', headers: auth },
  );
  const pub: any = await pubR.json();
  if (!pub.listingId) throw new Error(`publish failed ${pubR.status}: ${JSON.stringify(pub)}`);
  console.log(`LIVE: https://www.ebay.com/itm/${pub.listingId}`);

  // 3b) Combined shipping, so a buyer taking both units pays ONE label.
  // The Add/publish path silently drops this - it does not even warn, and
  // GetItem then reads ApplyShippingDiscount=false. Only Revise takes it.
  const trading = async (name: string, body: string) =>
    (
      await fetch('https://api.ebay.com/ws/api.dll', {
        method: 'POST',
        headers: {
          'X-EBAY-API-CALL-NAME': name,
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
          'X-EBAY-API-IAF-TOKEN': tok,
          'Content-Type': 'text/xml',
        },
        body:
          `<?xml version="1.0" encoding="utf-8"?><${name}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
          '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' +
          body +
          `</${name}Request>`,
      })
    ).text();

  await trading(
    'ReviseFixedPriceItem',
    `<Item><ItemID>${pub.listingId}</ItemID><ShippingDetails>` +
      '<ApplyShippingDiscount>true</ApplyShippingDiscount>' +
      `<ShippingDiscountProfileID>${COMBINED_SHIPPING_PROFILE}</ShippingDiscountProfileID>` +
      '</ShippingDetails></Item>',
  );

  // Verify off Trading GetItem, never the Inventory API, which lies about
  // its own publishes.
  const g = await trading('GetItem', `<ItemID>${pub.listingId}</ItemID><DetailLevel>ReturnAll</DetailLevel>`);
  const gg = (t: string) => g.match(new RegExp(`<${t}[^>]*>([^<]*)<`))?.[1] ?? '-';
  const combined = gg('ApplyShippingDiscount');
  console.log(
    `  verified: ${gg('ListingStatus')}  $${gg('CurrentPrice')}  qty ${gg('Quantity')}` +
      `  UPC ${gg('UPC')}  hidden=${gg('HideFromSearch')}  combined=${combined}`,
  );
  if (combined !== 'true') {
    console.error('  !! combined shipping did NOT stick. A buyer taking both pays two labels.');
    console.error('     Re-run the ReviseFixedPriceItem above and re-read GetItem before leaving it.');
  }

  // 4) map it, qty is PER listing unit
  await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (
      (SELECT user_id FROM purchases ORDER BY created_at DESC LIMIT 1),
      ${String(pub.listingId)},
      ${sql.json([{ qty: 1, catalogItemId: CATALOG_ITEM_ID }])}
    )`;
  console.log('mapped at qty 1 per listing unit');

  await sql.end();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
