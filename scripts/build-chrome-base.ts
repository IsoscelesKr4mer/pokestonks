/**
 * 2026 Topps Chrome BASE cards -> one Trading API "you pick" listing.
 * Same pattern as the mojo group: plan, free the SKUs, AddFixedPriceItem with
 * a picture set per card so the photo follows the dropdown.
 *
 *   npx tsx scripts/build-chrome-base.ts            # plan only
 *   npx tsx scripts/build-chrome-base.ts --apply    # end singles, create listing
 *
 * Teams and RC / Rookie Cup flags below were read off the card fronts, not the
 * notes column, which was blank or stale for half the batch.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const TITLE = '2026 Topps Chrome Baseball You Pick Card Base RC Rookie MLB Singles';
const VARY_BY = 'Card # / Player / Team';

// id -> [team, flag]; verified against each card front
const CARDS: Record<string, [string, string]> = {
  '61':  ['Yankees', ''],
  '64':  ['Mariners', ''], // photo variation, but Michael wants it out of the dropdown label
  '87':  ['Nationals', 'RC'],
  '88':  ['Orioles', 'RC'],
  '89':  ['Reds', 'RC'],
  '90':  ['Reds', 'RC'],
  '91':  ['Rockies', 'RC'],
  '92':  ['Mets', 'RC'],
  '93':  ['White Sox', 'RC'],
  '94':  ['Rangers', 'RC'],
  '135': ['Marlins', 'Rookie Cup'],
  '137': ['Mariners', 'RC'],
  '142': ['Orioles', 'RC'],
  '143': ['Angels', 'RC'],
  '147': ['Guardians', 'RC'],
  '148': ['Athletics', 'Rookie Cup'],
  '149': ['Dodgers', 'Rookie Cup'],
  '155': ['Phillies', 'RC'],
};
// id 139 Jackson Merrill is held back: the front shows a wavy refractor finish,
// not the flat base stock the rest of this batch has. Confirm the parallel first.
const HOLD_BACK = ['139'];

const DESCRIPTION = [
  '<p>2026 Topps Chrome baseball base cards. Pick your card from the dropdown above.</p>',
  '<p>Raw / ungraded, near mint or better. Cards ship in a penny sleeve and toploader protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
  '<p>Buying several? Add them all to your cart and they ship together.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

const SHARED_SPECIFICS: Record<string, string> = {
  Sport: 'Baseball',
  League: 'Major League Baseball (MLB)',
  Type: 'Sports Trading Card',
  Set: '2026 Topps Chrome',
  Season: '2026',
  Manufacturer: 'Topps',
  Grade: 'Ungraded',
  Graded: 'No',
  Vintage: 'No',
  Autographed: 'No',
};

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

async function inv(tok: string, method: string, path: string, body?: any) {
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  const text = typeof node === 'string' ? esc(node) : String(node);
  return name ? `<${name}>${text}</${name}>` : text;
}

async function main() {
  const rows: any = await sql`
    SELECT id, player, card_number, asking_price_cents, ebay_sku, ebay_offer_id, photo_urls
    FROM baseball_cards
    WHERE set_name = '2026 Topps Chrome' AND parallel LIKE 'base%' AND status = 'listed'
    ORDER BY player`;

  const variations = rows
    .filter((r: any) => !HOLD_BACK.includes(r.id))
    .map((r: any) => {
      const [team, flag] = CARDS[r.id] ?? ['', ''];
      if (!team) throw new Error(`no verified team for id ${r.id} ${r.player}`);
      const label = `${r.card_number} - ${r.player} - ${team}${flag ? ` (${flag})` : ''}`;
      if (label.length > 50) throw new Error(`label over 50 chars: ${label}`);
      return { label, sku: r.ebay_sku, id: r.id, offerId: r.ebay_offer_id,
               price: r.asking_price_cents, photos: r.photo_urls || [] };
    })
    .sort((a: any, b: any) => Number(a.label.split(' - ')[0]) - Number(b.label.split(' - ')[0]));

  const ask = variations.reduce((n: number, v: any) => n + v.price, 0);
  console.log(`TITLE (${TITLE.length} chars): ${TITLE}`);
  console.log(`${variations.length} rows / $${(ask / 100).toFixed(2)} ask` +
              (HOLD_BACK.length ? ` | held back: ${HOLD_BACK.join(', ')}` : ''));
  for (const v of variations) {
    console.log(`  $${(v.price / 100).toFixed(2).padStart(5)}  ${v.label.padEnd(46)} ${v.sku} ${v.photos.length}pic`);
  }

  const gallery = ['100', '149', '6', '250', '236', '259']
    .map((n) => variations.find((v: any) => v.label.startsWith(n + ' - '))?.photos[0])
    .filter(Boolean);

  const item = {
    Title: TITLE,
    Description: DESCRIPTION,
    PrimaryCategory: { CategoryID: '261328' },
    ConditionID: 4000,
    ConditionDescriptors: { ConditionDescriptor: { Name: '40001', Value: '400010' } },
    Country: 'US', Currency: 'USD',
    Location: 'Edmonds, Washington', PostalCode: '98026',
    DispatchTimeMax: 2, ListingDuration: 'GTC', ListingType: 'FixedPriceItem',
    // SKU-keyed variations, so a dropdown label can be renamed in place later.
    // Without this eBay matches variations by their specifics and rejects a
    // rename with "Variation Specifics Mismatch". Setting it also makes an
    // item-level SKU mandatory (error 21916272).
    InventoryTrackingMethod: 'SKU',
    SKU: 'CHROME2026-BASE-YOUPICK',
    SellerProfiles: {
      SellerShippingProfile: { ShippingProfileID: '272052757012' },
      SellerReturnProfile: { ReturnProfileID: '269110705012' },
      SellerPaymentProfile: { PaymentProfileID: '269110704012' },
    },
    ItemSpecifics: { NameValueList: Object.entries(SHARED_SPECIFICS).map(([Name, Value]) => ({ Name, Value })) },
    PictureDetails: { GalleryType: 'Gallery', PictureURL: gallery },
    Variations: {
      VariationSpecificsSet: { NameValueList: [{ Name: VARY_BY, Value: variations.map((v: any) => v.label) }] },
      Variation: variations.map((v: any) => ({
        SKU: v.sku,
        StartPrice: (v.price / 100).toFixed(2),
        Quantity: 1,
        VariationSpecifics: { NameValueList: [{ Name: VARY_BY, Value: v.label }] },
      })),
      Pictures: {
        VariationSpecificName: VARY_BY,
        VariationSpecificPictureSet: variations.map((v: any) => ({
          VariationSpecificValue: v.label, PictureURL: v.photos,
        })),
      },
    },
  };
  writeFileSync('scripts/_chromebase_trading.json', JSON.stringify(item, null, 2));

  if (!APPLY) { console.log('\ndry run - pass --apply to end the singles and create the listing'); await sql.end(); return; }

  const tok = await userToken();
  for (const v of variations) {
    if (v.offerId) await inv(tok, 'POST', `/sell/inventory/v1/offer/${v.offerId}/withdraw`).catch((e) => console.log(`  withdraw ${v.sku}: ${e.message.slice(0, 90)}`));
    await inv(tok, 'DELETE', `/sell/inventory/v1/inventory_item/${v.sku}`).catch((e) => console.log(`  delete ${v.sku}: ${e.message.slice(0, 90)}`));
  }
  console.log(`${variations.length} singles ended, SKUs free`);

  const xml = `<?xml version="1.0" encoding="utf-8"?>` +
    `<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(item, 'Item') + `</AddFixedPriceItemRequest>`;

  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const text = await r.text();
  const itemId = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  console.log('ack:', text.match(/<Ack>(\w+)<\/Ack>/)?.[1], '| itemId:', itemId);
  for (const m of text.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log(' ', m[1] + ':', m[2]);
  if (!itemId) { console.log(text.slice(0, 1500)); await sql.end(); return; }

  for (const v of variations) {
    await sql`UPDATE baseball_cards SET ebay_item_id = ${itemId}, ebay_offer_id = NULL, updated_at = now() WHERE id = ${v.id}`;
  }
  console.log(`db updated -> https://www.ebay.com/itm/${itemId}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
