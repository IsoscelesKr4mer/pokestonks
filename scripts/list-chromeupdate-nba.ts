/**
 * 2025-26 Topps Chrome Update Basketball, release day 2026-08-06.
 * Two listings, qty 2 each. No lots: a qty-2 listing already lets one buyer
 * take both, so it captures the multi-buyer without excluding single buyers.
 *
 *   npx tsx scripts/list-chromeupdate-nba.ts            # dry run
 *   npx tsx scripts/list-chromeupdate-nba.ts --stage    # create, NOT live
 *   npx tsx scripts/list-chromeupdate-nba.ts --publish  # publish + map to vault
 *
 * Contents are quoted from the box backs, not from secondary sites (which
 * claimed "10 X-Fractors"; the mega back actually advertises RayWave parallels).
 * SEALED is a real differentiator here: Topps shipped presale boxes with the
 * seal broken to deter resellers, and the one unsealed box that sold on release
 * day went for $119.99 against a $126.50 median for sealed in-hand.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
import { quantityForPublish } from './lib/live-qty';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

type Item = {
  sku: string; catalogItemId: number; price: string; qty: number; costEach: number;
  title: string; numberOfCards: string; weightOz: number; body: string; photos: string[]; upc: string;
};

const ITEMS: Item[] = [
  {
    sku: 'CHROMEUPD-NBA-MEGA-R2',
    catalogItemId: 135078,
    price: '129.99',
    qty: 3,   // 4 bought at Target, 1 shipped against order 18-14987-46766
    costEach: 93.96,
    upc: '887521161485',
    title: '2025-26 Topps Chrome Update Basketball Mega Box SEALED IN HAND Flagg',
    numberOfCards: '42',
    weightOz: 12,   // Michael weighed a packed mega at 11.8 oz on 2026-08-07
    body: '7 packs per box, 6 cards per pack (42 cards total). Look for NBA Debut Patch Autographs, color RayWave parallels, and the Paradox and Glass Canvas case hits. Rookie class led by Cooper Flagg, with Victor Wembanyama on the box.',
    photos: ['ToppsChromeUpdateNBA_MegaBox_01_front.JPEG', 'ToppsChromeUpdateNBA_MegaBox_02_back.JPEG'],
  },
  {
    sku: 'CHROMEUPD-NBA-VALUE',
    catalogItemId: 135079,
    price: '64.99',
    qty: 2,
    costEach: 45.92,
    upc: '887521161430',
    // "Blaster" added 2026-08-07: Michael says buyers commonly call these
    // blasters, so the listing needs to match that search term as well as
    // "Value Box". Lands at exactly the 80-char cap.
    title: '2025-26 Topps Chrome Update Basketball Value Blaster Box SEALED IN HAND 28 Cards',
    numberOfCards: '28',
    weightOz: 12,   // blaster is smaller than the mega, so 12 oz is if anything generous
    body: '7 packs per box, 4 cards per pack (28 cards total). Look for NBA Debut Patch Autographs, Basketball and Red White and Blue Refractors, and the Paradox and Glass Canvas case hits. Rookie class led by Cooper Flagg, with Victor Wembanyama on the box.',
    photos: ['ToppsChromeUpdateNBA_ValueBox_01_front.JPEG', 'ToppsChromeUpdateNBA_ValueBox_02_back.JPEG', 'ToppsChromeUpdateNBA_ValueBox_03_back_upc.JPEG'],
  },
];

const describe = (it: Item) => [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  `<p>Factory-sealed 2025-26 Topps Chrome Update Series Basketball ${/Mega/.test(it.title) ? 'Mega' : 'Value'} Box.</p>`,
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
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

const inventoryFor = (it: Item) => ({
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: it.weightOz, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: it.qty } },
  product: {
    title: it.title,
    description: describe(it),
    brand: 'Topps',
    mpn: 'Does Not Apply',
    // UPC off the box back. eBay needs it to match the listing to its catalog
    // product; omitting it cost these listings placement on day one.
    upc: [it.upc],
    aspects: {
      Sport: ['Basketball'],
      League: ['National Basketball Association (NBA)'],
      Autographed: ['No'],
      Set: ['2025-26 Topps Chrome Update'],
      Configuration: ['Box'],
      'Number of Cards': [it.numberOfCards],
      Manufacturer: ['Topps'],
      'Number of Boxes': ['1'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
    },
    imageUrls: it.photos.map((p) => BASE + p),
  },
});

const offerFor = (it: Item) => ({
  sku: it.sku,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: it.qty,
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

async function existingOfferId(tok: string, sku: string): Promise<string | null> {
  try {
    const res = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${sku}`);
    return res?.offers?.[0]?.offerId ?? null;
  } catch (e) {
    if (String(e).includes('-> 404')) return null;
    throw e;
  }
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  for (const it of ITEMS) {
    const net = Number(it.price) * 0.864 - 0.3;
    console.log(`${it.title}`);
    console.log(`  ${it.title.length} chars | $${it.price} x ${it.qty} | net $${net.toFixed(2)} | cost $${it.costEach.toFixed(2)} | +$${(net - it.costEach).toFixed(2)}/box`);
  }
  for (const it of ITEMS) {
    assertPreflight(it.sku, await preflight({
      sku: it.sku, title: it.title, priceCents: Math.round(Number(it.price) * 100),
      costCentsPerUnit: Math.round(it.costEach * 100), unitsPerListing: 1,
      upc: it.upc, imageUrls: it.photos.map((p) => BASE + p),
    }));
  }

  if (!STAGE && !PUBLISH) { console.log('\ndry run'); await sql.end(); return; }

  const tok = await userToken();
  const [u] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;

  for (const it of ITEMS) {
    // Never reassert the script's qty over what eBay currently shows. A
    // cosmetic revise used to reset availableQuantity and put sold stock back
    // on the shelf; that is how this listing sold 3 boxes against 2.
    const [h] = await sql<{ held: number }[]>`
      SELECT COALESCE(SUM(p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM purchases p WHERE p.catalog_item_id=${it.catalogItemId} AND p.deleted_at IS NULL`;
    const [ls] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM sales s
      JOIN purchases p ON p.id = s.purchase_id
      WHERE p.catalog_item_id = ${it.catalogItemId} AND s.platform = 'eBay'`;
    const { qty, note, blocked } = await quantityForPublish({
      sku: it.sku,
      desiredQty: it.qty,
      heldQty: h.held,
      loggedSales: ls.n,
      getOffer: async (sku) => {
        try {
          const r = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${sku}`);
          return r?.offers?.[0] ?? null;
        } catch { return null; }
      },
    });
    console.log(`  ${it.sku}: ${note}`);
    if (blocked) continue;
    it.qty = qty;

    // The matching twofer takes BOTH boxes, so it must come down before a
    // qty-2 single goes up or the same two boxes are committed twice.
    try {
      const tw = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${it.sku}-2X`);
      const to = tw?.offers?.[0];
      if (to?.status === 'PUBLISHED') {
        await api(tok, 'POST', `/sell/inventory/v1/offer/${to.offerId}/withdraw`);
        await sql`DELETE FROM ebay_listing_mappings WHERE ebay_item_id=${String(to.listing.listingId)}`;
        console.log(`withdrew twofer ${to.listing.listingId} (${it.sku}-2X)`);
      }
    } catch (e) {
      if (!String(e).includes('-> 404')) throw e;
    }

    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${it.sku}`, inventoryFor(it));
    let offerId = await existingOfferId(tok, it.sku);
    if (offerId) await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerFor(it));
    else offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerFor(it))).offerId;
    console.log(`${it.sku}: offer ${offerId}`);

    if (!PUBLISH) { console.log('   STAGED, not published'); continue; }

    const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
    const itemId = String(pub.listingId);
    console.log(`   published ${itemId}  https://www.ebay.com/itm/${itemId}`);
    const existing = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
    if (existing.length === 0) {
      await sql`
        INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
        VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: it.catalogItemId }])})`;
      console.log(`   mapped 1x ci${it.catalogItemId} per unit sold`);
    }
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
