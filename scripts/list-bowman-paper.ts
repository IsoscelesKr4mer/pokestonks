/**
 * List the three 2026 Bowman PAPER cards individually.
 *
 *   npx tsx scripts/list-bowman-paper.ts           # dry run
 *   npx tsx scripts/list-bowman-paper.ts --apply   # create + publish + repoint DB
 *
 * These were pulled out of the Bowman Chrome you-pick on 2026-08-09 because
 * paper Bowman (red Bowman logo) is a different product from Bowman Chrome and
 * was being mislabelled by that listing's title. Michael asked for them on
 * their own rather than held back for a future paper group.
 *
 * "Paper" is in every title on purpose: it is the word collectors use to
 * separate these from Chrome, and leaving it out is what caused the problem.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CARDS = [
  { id: 128, sku: 'BBC-128-PAPER', title: '2026 Bowman Paper Cal Raleigh Blue Parallel 028/150 #13 Mariners', team: 'Seattle Mariners', numbered: true },
  { id: 203, sku: 'BBC-203-PAPER', title: '2026 Bowman Paper Aaron Judge #1 New York Yankees Baseball Card', team: 'New York Yankees', numbered: false },
  { id: 197, sku: 'BBC-197-PAPER', title: '2026 Bowman Paper Shohei Ohtani #52 Los Angeles Dodgers Baseball Card', team: 'Los Angeles Dodgers', numbered: false },
];

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function trueState(tok: string, itemId: string) {
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

async function main() {
  const ids = CARDS.map((c) => c.id);
  const rows: any = await sql`
    SELECT id, player, set_name, card_number, parallel, asking_price_cents, photo_urls, status
    FROM baseball_cards WHERE id = ANY(${ids})`;
  const byId = new Map(rows.map((r: any) => [Number(r.id), r]));

  for (const c of CARDS) {
    const r: any = byId.get(c.id);
    if (!r) { console.error(`card ${c.id} not found`); process.exit(1); }
    console.log(`${c.title}\n  ${c.title.length} chars | $${(r.asking_price_cents / 100).toFixed(2)} | ${r.photo_urls?.length ?? 0} photos | ${r.parallel}`);
    if (c.title.length > 80) { console.error('  TITLE TOO LONG'); process.exit(1); }
    if (!r.photo_urls?.length) { console.error('  NO PHOTOS'); process.exit(1); }
  }
  if (!APPLY) { console.log('\ndry run - pass --apply'); await sql.end(); return; }

  const tok = await userToken();
  for (const c of CARDS) {
    const r: any = byId.get(c.id);
    const price = (r.asking_price_cents / 100).toFixed(2);
    const desc = [
      `<p><strong>${c.title}</strong></p>`,
      `<p>2026 Bowman <strong>paper</strong> (not Bowman Chrome). ${r.parallel.includes('Blue') ? 'Blue parallel, serial numbered 028/150.' : 'Base card.'}</p>`,
      '<p>Raw / ungraded, near mint or better straight from the pack. Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>',
      '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    ].join('\n');

    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${c.sku}`, {
      locale: 'en_US',
      condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      packageWeightAndSize: { dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' }, weight: { value: 2, unit: 'OUNCE' }, shippingIrregular: false },
      availability: { shipToLocationAvailability: { quantity: 1 } },
      product: {
        title: c.title, description: desc, brand: 'Bowman', mpn: 'Does Not Apply',
        aspects: {
          Sport: ['Baseball'], League: ['Major League Baseball (MLB)'],
          Player: [r.player], Team: [c.team], Season: ['2026'],
          Manufacturer: ['Bowman'], Set: ['2026 Bowman'],
          'Card Number': [String(r.card_number)],
          Parallel: [c.numbered ? 'Blue' : 'Base'],
          Features: c.numbered ? ['Serial Numbered', 'Parallel/Variety'] : ['Base Set'],
          Grade: ['Ungraded'], Autographed: ['No'],
        },
        imageUrls: r.photo_urls,
      },
    });

    let offerId: string;
    const offerBody = {
      sku: c.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '261328', merchantLocationKey: 'edmonds-wa',
      listingDescription: desc, listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: '272052757012', eBayPlusIfEligible: false },
      pricingSummary: { price: { value: price, currency: 'USD' } }, tax: { applyTax: false },
    };
    try {
      offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${c.sku}`)).offers[0].offerId;
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerBody);
    } catch {
      offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerBody)).offerId;
    }

    let itemId = '';
    try {
      itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
    } catch (e) {
      itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${c.sku}`)).offers[0]?.listing?.listingId ?? '');
      if (!itemId) { console.error(`publish failed for ${c.sku}: ${String(e).slice(0, 160)}`); continue; }
    }
    const st = await trueState(tok, itemId);
    console.log(`${c.sku} -> ${itemId} [${st}] $${price}  https://www.ebay.com/itm/${itemId}`);
    if (st !== 'Active') { console.error('  NOT ACTIVE, leaving DB alone'); continue; }

    await sql`
      UPDATE baseball_cards SET ebay_item_id=${itemId}, ebay_offer_id=${offerId}, ebay_sku=${c.sku},
        status='listed', updated_at=now() WHERE id=${c.id}`;
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
