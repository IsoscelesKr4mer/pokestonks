/**
 * List individual baseball_cards rows as their own eBay listings.
 *
 *   npx tsx scripts/list-single-cards.ts 318 319 285          # dry run
 *   npx tsx scripts/list-single-cards.ts 318 319 285 --apply
 *
 * For anything above the $10 you-pick cutoff, where a dedicated title and its
 * own photos are worth more than dropdown convenience. Verifies every publish
 * with Trading GetItem, because the Inventory API has twice reported a listing
 * as live when it was not.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const IDS = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function trueStatus(tok: string, itemId: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await r.text();
  return x.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?';
}

/** Under 80 chars, front-loading what a buyer searches for. */
function buildTitle(c: any) {
  const year = c.set_name.match(/^(\d{4})/)?.[1] ?? String(c.year);
  const setShort = c.set_name.replace(/^\d{4}\s*/, '').replace(/\s*\(.*\)\s*$/, '');
  const par = /^base$/i.test(c.parallel) ? '' : c.parallel.replace(/\s*\(.*\)\s*/g, ' ').trim();
  const rc = /\bRC\b/.test(c.notes ?? '') ? ' RC' : '';
  const bits = [year, setShort, c.player, par, `#${c.card_number}`, rc.trim(), 'Baseball Card'].filter(Boolean);
  let t = bits.join(' ').replace(/\s+/g, ' ').trim();
  if (t.length > 80) t = [year, setShort, c.player, par, `#${c.card_number}`].filter(Boolean).join(' ').trim();
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t;
}

async function main() {
  if (!IDS.length) { console.error('usage: list-single-cards.ts <id> [<id>...] [--apply]'); process.exit(1); }
  const cards: any = await sql`
    SELECT id, player, set_name, year, card_number, parallel, asking_price_cents AS ask,
           photo_urls, COALESCE(notes,'') AS notes, status, ebay_item_id
    FROM baseball_cards WHERE id = ANY(${IDS}) ORDER BY asking_price_cents DESC`;

  const tok = APPLY ? await userToken() : '';
  for (const c of cards) {
    const title = buildTitle(c);
    console.log(`\n#${c.id} ${title}`);
    console.log(`   ${title.length} chars | $${(c.ask / 100).toFixed(2)} | ${c.photo_urls?.length ?? 0} photos`);
    if (title.length > 80) { console.error('   TITLE TOO LONG, skipping'); continue; }
    if (!c.photo_urls?.length) { console.error('   NO PHOTOS, skipping'); continue; }
    if (c.ebay_item_id) { console.log('   already has a listing, skipping'); continue; }
    if (!APPLY) continue;

    const sku = `BBC-${c.id}`;
    const rc = /\bRC\b/.test(c.notes);
    const desc = [
      `<p><strong>${title}</strong></p>`,
      `<p>${c.set_name}${/^base$/i.test(c.parallel) ? '' : `, ${c.parallel}`}. Card #${c.card_number}.${rc ? ' Rookie card.' : ''}</p>`,
      '<p>Raw / ungraded, near mint or better straight from the pack. Ships in a penny sleeve and toploader, protected between rigid cardboard, with tracking. Ships within 1 business day.</p>',
      '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    ].join('\n');

    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${sku}`, {
      locale: 'en_US',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      packageWeightAndSize: { dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' }, weight: { value: 2, unit: 'OUNCE' }, shippingIrregular: false },
      availability: { shipToLocationAvailability: { quantity: 1 } },
      product: {
        title, description: desc, brand: 'Topps', mpn: 'Does Not Apply',
        aspects: {
          Sport: ['Baseball'], League: ['Major League Baseball (MLB)'],
          Player: [c.player], Season: [String(c.year)], Manufacturer: ['Topps'],
          Set: [c.set_name.replace(/\s*\(.*\)\s*$/, '')],
          'Card Number': [String(c.card_number)],
          Parallel: [/^base$/i.test(c.parallel) ? 'Base' : c.parallel.replace(/\s*\(.*\)\s*/g, ' ').trim()],
          Grade: ['Ungraded'], Autographed: ['No'],
          Features: rc ? ['Rookie'] : ['Parallel/Variety'],
        },
        imageUrls: c.photo_urls,
      },
    });

    const offerBody = {
      sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '261328', merchantLocationKey: 'edmonds-wa',
      listingDescription: desc, listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: '272052757012', eBayPlusIfEligible: false },
      pricingSummary: { price: { value: (c.ask / 100).toFixed(2), currency: 'USD' } }, tax: { applyTax: false },
    };
    let offerId: string;
    try {
      offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${sku}`)).offers[0].offerId;
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerBody);
    } catch {
      offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerBody)).offerId;
    }

    let itemId = '';
    try {
      itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
    } catch (e) {
      itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${sku}`)).offers[0]?.listing?.listingId ?? '');
      if (!itemId) { console.error(`   publish failed: ${String(e).slice(0, 120)}`); continue; }
    }
    const st = await trueStatus(tok, itemId);
    console.log(`   -> ${itemId} [${st}]  https://www.ebay.com/itm/${itemId}`);
    if (st !== 'Active') { console.error('   NOT ACTIVE, leaving the DB alone'); continue; }
    await sql`
      UPDATE baseball_cards SET ebay_item_id=${itemId}, ebay_offer_id=${offerId}, ebay_sku=${sku},
        status='listed', for_sale=true, updated_at=now() WHERE id=${c.id}`;
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
