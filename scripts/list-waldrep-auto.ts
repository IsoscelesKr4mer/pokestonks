/**
 * 2026 Topps Finest Hurston Waldrep Purple Mini-Diamond Auto 33/75 #FMA-HW.
 *
 *   npx tsx scripts/list-waldrep-auto.ts            # dry run
 *   npx tsx scripts/list-waldrep-auto.ts --publish  # host photos, insert row, go live
 *
 * Pulled from the 2026-08-08 Finest mega rip (lot #528). Michael asked for this
 * one listed on its own rather than queued behind the other 43 cards.
 *
 * PARALLEL IS CONFIRMED, NOT GUESSED. The card itself shows only "33/75" and
 * #FMA-HW. eBay Browse actives for the same card number name it explicitly:
 * "2026 Topps Finest Hurston Waldrep Purple Mini-Diamond Auto #FMA-HW /75".
 * The Mini Diamond rainbow puts Purple at /75, which agrees.
 *
 * PRICE. Active comps for this exact card on 2026-08-09: $17.99, $19.99
 * (45/75) and $24.95. The wider Waldrep auto market is soft - base FMA-HW autos
 * ask $8.99-$15, Blue /150 $13.99-$19.98, Aqua /199 $11-$12.99, and only the
 * Orange /25 reaches $79.99. So $16.99 undercuts every active /75 and is priced
 * to actually move, consistent with Michael's standing preference.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');

const SKU = 'BBC-WALDREP-FMA75';
const PRICE = '16.99';
const DIR = 'eBay_assets/card drop';
const FRONT = 'IMG_1193.JPEG';
const BACK = 'IMG_1194.JPEG';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

// 77 chars.
const TITLE = '2026 Topps Finest Hurston Waldrep Purple Mini-Diamond Auto /75 #FMA-HW Braves';

const DESCRIPTION = [
  '<p><strong>2026 Topps Finest Hurston Waldrep on-card autograph, Purple Mini-Diamond parallel, numbered 33/75.</strong></p>',
  '<p>Card #FMA-HW, Atlanta Braves. Topps Certified Autograph Issue.</p>',
  '<p>Pulled from a factory-sealed 2026 Topps Finest Mega Box and straight into a sleeve and toploader. Never handled beyond that.</p>',
  '<p>Ships within 1 business day. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

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
/** Trading GetItem - the Inventory API cannot be trusted about its own publish. */
async function trueState(tok: string, itemId: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await r.text();
  const p = (t: string) => x.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '?';
  return { status: p('ListingStatus'), hidden: p('HideFromSearch'), price: x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? '?' };
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function host(img: string) {
  const name = `bbcard_drop_${img.replace('.JPEG', '').replace('IMG_', '')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${img}`), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`host fail ${img}: ${error.message}`);
  return PUB + name;
}

async function main() {
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE}`);
  if (TITLE.length > 80) { console.error('TITLE TOO LONG'); process.exit(1); }
  const net = Number(PRICE) * 0.847;
  console.log(`  net after fees ~$${net.toFixed(2)} | undercuts actives at $17.99 / $19.99 / $24.95`);

  if (!PUBLISH) { console.log('\ndry run - pass --publish'); await sql.end(); return; }

  const imageUrls = [await host(FRONT), await host(BACK)];
  console.log('photos hosted:'); imageUrls.forEach((u) => console.log('  ' + u));
  for (const u of imageUrls) {
    const h = await fetch(u, { method: 'HEAD' });
    if (!h.ok) { console.error(`image unreachable: ${u}`); await sql.end(); process.exit(1); }
  }

  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, {
    locale: 'en_US',
    condition: 'USED_VERY_GOOD',
    conditionDescriptors: [{ name: '40001', values: ['400010'] }],
    packageWeightAndSize: { dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' }, weight: { value: 2, unit: 'OUNCE' }, shippingIrregular: false },
    availability: { shipToLocationAvailability: { quantity: 1 } },
    product: {
      title: TITLE,
      description: DESCRIPTION,
      brand: 'Topps',
      mpn: 'Does Not Apply',
      aspects: {
        Sport: ['Baseball'],
        League: ['Major League Baseball (MLB)'],
        Player: ['Hurston Waldrep'],
        Team: ['Atlanta Braves'],
        Season: ['2026'],
        Manufacturer: ['Topps'],
        Set: ['2026 Topps Finest'],
        Parallel: ['Purple Mini-Diamond'],
        Features: ['Serial Numbered', 'Autograph'],
        'Card Number': ['FMA-HW'],
        Autographed: ['Yes'],
        'Autograph Authentication': ['Topps'],
        Grade: ['Ungraded'],
      },
      imageUrls,
    },
  });

  let offerId: string;
  try {
    offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0].offerId;
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, {
      availableQuantity: 1, categoryId: '261328', merchantLocationKey: 'edmonds-wa',
      listingDescription: DESCRIPTION, listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: '272052757012', eBayPlusIfEligible: false },
      pricingSummary: { price: { value: PRICE, currency: 'USD' } }, tax: { applyTax: false },
    });
  } catch {
    offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', {
      sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '261328', merchantLocationKey: 'edmonds-wa',
      listingDescription: DESCRIPTION, listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: '272052757012', eBayPlusIfEligible: false },
      pricingSummary: { price: { value: PRICE, currency: 'USD' } }, tax: { applyTax: false },
    })).offerId;
  }

  let itemId = '';
  try {
    itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`publish errored, checking whether it applied: ${String(e).slice(0, 140)}`);
    itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0]?.listing?.listingId ?? '');
    if (!itemId) { console.error('publish genuinely failed'); await sql.end(); process.exit(1); }
  }

  const t = await trueState(tok, itemId);
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API: status ${t.status}, price $${t.price}, hiddenFromSearch ${t.hidden}`);
  if (t.status !== 'Active') { console.error('NOT ACTUALLY LIVE'); await sql.end(); process.exit(1); }

  const [c] = await sql`
    INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport, status, for_sale, asking_price_cents, comp_note, photo_urls, ebay_item_id, ebay_offer_id, ebay_sku, needs_back_photo, notes)
    VALUES (${UID}, 'Hurston Waldrep', '2026 Topps Finest', 2026, 'FMA-HW', 'Purple Mini-Diamond Autograph /75 (33/75)', 'Baseball', 'listed', true, 1699,
      'Active comps 2026-08-09 for the same card: $17.99, $19.99 (45/75), $24.95. Listed under all three.',
      ${sql.json(imageUrls)}, ${itemId}, ${offerId}, ${SKU}, false,
      'Pulled from the 2026-08-08 Topps Finest mega box rip (purchase lot #528).')
    RETURNING id`;
  console.log(`baseball_cards row #${c.id}`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
