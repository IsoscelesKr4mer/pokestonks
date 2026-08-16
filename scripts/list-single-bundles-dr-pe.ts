/**
 * Single Booster Bundle listings for Destined Rivals and Prismatic Evolutions.
 *
 *   npx tsx scripts/list-single-bundles-dr-pe.ts            # plan + upload photos
 *   npx tsx scripts/list-single-bundles-dr-pe.ts --stage    # create offers, NOT live
 *   npx tsx scripts/list-single-bundles-dr-pe.ts --publish  # LIVE
 *
 * Same reasoning as the Shrouded Fable split: a single-bundle listing reaches
 * every buyer who wants one, where a twofer asks them to take two while ~140
 * other sellers offer one. DR and PE both have deep single-bundle markets.
 *
 * INVENTORY, reconciled against live eBay rather than the vault alone. Held is
 * 5 DR and 2 PE. Four listings map these products, but only ONE is still Active
 * (168606266070, the PE+DR combo at $159.99, qty 1), so exactly 1 DR and 1 PE
 * are already committed. That leaves 4 DR and 1 PE free, which is the quantity
 * used here. The other three mappings point at Completed listings and commit
 * nothing.
 *
 * PRICING, from 148 DR and 141 PE active single-bundle comps after filtering out
 * lots, cases, displays and ETBs:
 *   DR   low $59.00  Q1 $65.00  med $70.00  Q3 $80.00
 *   PE   low $75.00  Q1 $80.00  med $87.99  Q3 $95.00
 * Priced at Q1, not the median, because the median is the price that is not
 * selling. Cost is $30.00 a bundle on every open lot, all vending machine.
 *
 * UPC: Michael said not to worry about them, and the barcode panel is not in
 * these photos. Left null deliberately rather than guessed; the bundle ships in
 * more than one box footprint with different barcodes, so it cannot be looked up.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const BUCKET = 'ebay-listings';
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

type Product = {
  key: string; sku: string; catalogItemId: number; qty: number; price: string; cost: number;
  title: string; set: string; photos: [number, string][]; blurb: string;
};

const PRODUCTS: Product[] = [
  {
    key: 'DR', sku: 'DR-BUNDLE-SINGLE', catalogItemId: 17235, qty: 4, price: '64.99', cost: 3000,
    title: 'Pokemon Destined Rivals Booster Bundle Sealed 6 Booster Packs Scarlet Violet',
    set: 'Scarlet & Violet: Destined Rivals',
    photos: [[1591, 'DestinedRivals_BoosterBundle_single_01_front.jpg'], [1592, 'DestinedRivals_BoosterBundle_single_02_back.jpg']],
    blurb: 'Sealed Pokemon Scarlet &amp; Violet: Destined Rivals Booster Bundle.',
  },
  {
    key: 'PE', sku: 'PE-BUNDLE-SINGLE', catalogItemId: 19776, qty: 1, price: '79.99', cost: 3000,
    title: 'Pokemon Prismatic Evolutions Booster Bundle Sealed 6 Booster Packs Scarlet',
    set: 'Scarlet & Violet: Prismatic Evolutions',
    photos: [[1593, 'PrismaticEvolutions_BoosterBundle_single_01_front.jpg'], [1594, 'PrismaticEvolutions_BoosterBundle_single_02_back.jpg']],
    blurb: 'Sealed Pokemon Scarlet &amp; Violet: Prismatic Evolutions Booster Bundle.',
  },
];

const PAYMENT = '269110704012';
const RETURNS = '269110705012';
const SHIPPING = '269110723012';   // Ground Advantage, buyer paid. Never free shipping.
const LOCATION = 'edmonds-wa';
const CATEGORY = '261044';

function description(p: Product) {
  return [
    `<p>${p.blurb}</p>`,
    '<p>6 booster packs, 10 cards per pack, 60 cards total.</p>',
    '<p>Ships within 1 business day.</p>',
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('\n');
}

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
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

/** Units of this product already committed to a still-ACTIVE listing. */
async function committed(tok: string, catalogItemId: number) {
  const rows: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  let n = 0;
  for (const row of rows) {
    const hit = ((row.mappings as any[]) ?? []).filter((m) => Number(m.catalogItemId) === catalogItemId);
    if (!hit.length) continue;
    const g = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${row.ebay_item_id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
    }).then((r) => r.text());
    if ((g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '') !== 'Active') continue;
    const avail = Math.max(0, Number(g.match(/<Quantity>(\d+)</)?.[1] ?? 0) - Number(g.match(/<QuantitySold>(\d+)</)?.[1] ?? 0));
    for (const m of hit) n += Number(m.qty) * avail;
  }
  return n;
}

async function heldOf(catalogItemId: number) {
  const [h]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${catalogItemId} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  return Number(h.held);
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tok = await userToken();

  for (const p of PRODUCTS) {
    const held = await heldOf(p.catalogItemId);
    const used = await committed(tok, p.catalogItemId);
    const free = held - used;
    const net = Number(p.price) * 0.8675 - 0.4;
    console.log(`\n${p.title}  (${p.title.length} chars)`);
    console.log(`  held ${held}, committed to active listings ${used}, free ${free} -> listing qty ${p.qty}`);
    if (p.qty > free) { console.error(`  REFUSING: qty ${p.qty} would oversell; only ${free} free`); process.exit(1); }
    console.log(`  $${p.price} x ${p.qty} | net $${net.toFixed(2)} | cost $${(p.cost / 100).toFixed(2)} | +$${(net - p.cost / 100).toFixed(2)} each`);
    if (p.title.length > 80) { console.error('  title over 80'); process.exit(1); }
    for (const [n] of p.photos) if (!existsSync(`eBay_assets/IMG_${n}.JPEG`)) { console.error(`  missing IMG_${n}`); process.exit(1); }
  }
  if (!STAGE && !PUBLISH) { console.log('\nplan only. --stage to create offers, --publish to go live'); await sql.end(); return; }

  for (const p of PRODUCTS) {
    const urls: string[] = [];
    for (const [n, name] of p.photos) {
      const { error } = await sb.storage.from(BUCKET).upload(name, readFileSync(`eBay_assets/IMG_${n}.JPEG`), { contentType: 'image/jpeg', upsert: true });
      if (error) { console.error(`upload failed ${name}: ${error.message}`); process.exit(1); }
      urls.push(BASE + name);
    }
    for (const u of urls) if (!(await fetch(u, { method: 'HEAD' })).ok) { console.error(`unreachable ${u}`); process.exit(1); }

    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${p.sku}`, {
      locale: 'en_US', condition: 'NEW',
      packageWeightAndSize: { dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' }, weight: { value: 14, unit: 'OUNCE' }, shippingIrregular: false },
      availability: { shipToLocationAvailability: { quantity: p.qty } },
      product: {
        title: p.title, description: description(p), brand: 'Pokemon', mpn: 'Does Not Apply',
        aspects: {
          Game: ['Pokémon TCG'], Set: [p.set], Configuration: ['Booster Bundle'],
          Language: ['English'], 'Number of Packs': ['6'], Features: ['Sealed'],
        },
        imageUrls: urls,
      },
    });
    const offerBody = {
      sku: p.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: p.qty,
      categoryId: CATEGORY, merchantLocationKey: LOCATION, listingDescription: description(p),
      listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: PAYMENT, returnPolicyId: RETURNS, fulfillmentPolicyId: SHIPPING, eBayPlusIfEligible: false },
      pricingSummary: { price: { value: p.price, currency: 'USD' } }, tax: { applyTax: false },
    };
    let offerId: string;
    try {
      offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${p.sku}`)).offers[0].offerId;
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerBody);
    } catch {
      offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerBody)).offerId;
    }
    if (!PUBLISH) { console.log(`${p.key}: offer ${offerId} STAGED, not published`); continue; }

    const itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
    console.log(`${p.key}: published ${itemId}  https://www.ebay.com/itm/${itemId}`);
    const [u]: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
    const exists: any = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
    if (!exists.length) {
      await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
        VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: p.catalogItemId }])})`;
      console.log(`   mapped 1x ci${p.catalogItemId} per unit sold`);
    }
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
