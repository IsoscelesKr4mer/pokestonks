/**
 * Arquette: put the color match in the title, take the false 1st Bowman claim
 * out of the description.
 *
 *   npx tsx scripts/fix-arquette-colormatch-0912.ts           # dry run
 *   npx tsx scripts/fix-arquette-colormatch-0912.ts --apply
 *
 * Michael: "Just realized the aiva arquette is also color match."
 *
 * An orange parallel on a Marlins card. A premium that lives only in the
 * description does not exist to anyone scrolling search results, so it goes in
 * the title. "Refractor" is what pays for it; "Orange Shimmer" is the term that
 * actually identifies this parallel, and the card number, serial and team all
 * survive.
 *
 *   was: 2026 Bowman Chrome Aiva Arquette Orange Shimmer Refractor /25 #BCP-174 Marlins
 *   now: 2026 Bowman Chrome Aiva Arquette Orange Shimmer /25 BCP-174 Marlins Color Match
 *
 * Second fix, and this one is a live false claim on a $145 card. The
 * description still says "1st Bowman card." BCP-174 has no 1ST BOWMAN logo on
 * the front; that was checked against the card on 2026-09-11 and the title was
 * corrected then, but the description was missed.
 *
 * This listing came from the Inventory API, so the Trading API refuses to
 * revise it. Title lives on the inventory item, description lives on the offer.
 * The offer is read and sent back whole with only listingDescription changed,
 * and the price is asserted before and after: rerunning a builder script is how
 * the Dalis package silently went from $249.99 back to $299.99.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BOWCH-BCP174-3';
const ITEM = '168680124149';
const ROW = 560;
const TITLE = '2026 Bowman Chrome Aiva Arquette Orange Shimmer /25 BCP-174 Marlins Color Match';

const DESC =
  '<p>2026 Bowman Chrome Aiva Arquette Orange Shimmer Refractor /25 #BCP-174.</p>' +
  '<p>Serial numbered 22/25.</p>' +
  '<p>Team color match. The orange parallel matches the Marlins, which is the version collectors of this player go looking for.</p>' +
  '<p>Raw and ungraded, near mint or better. Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>' +
  '<p>Buying several? Add them all to your cart and they ship together.</p>' +
  '<p>Smoke-free home. Thanks for looking.</p>';

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function liveTitleAndDesc(tok: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>',
  });
  const x = await r.text();
  return {
    title: x.match(/<Title>([^<]*)</)?.[1] ?? '',
    price: x.match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '',
    desc: x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '',
  };
}

(async () => {
  if (TITLE.length > 80) throw new Error('title is ' + TITLE.length + ' chars');
  const tok = await userToken();
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const item: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, { headers: H })).json();
  if (!item.product) throw new Error('no inventory item for ' + SKU);
  const offers: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + SKU, { headers: H })).json();
  const offer = offers.offers?.[0];
  if (!offer) throw new Error('no offer for ' + SKU);
  const priceBefore = offer.pricingSummary?.price?.value;

  const live = await liveTitleAndDesc(tok);
  console.log('old title (' + live.title.length + '): ' + live.title);
  console.log('new title (' + TITLE.length + '): ' + TITLE);
  console.log('price $' + priceBefore + ' (live $' + live.price + ')');
  console.log('description currently claims 1st Bowman: ' + /1st Bowman/i.test(live.desc));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  // title
  const invBody = { ...item, product: { ...item.product, title: TITLE } };
  delete (invBody as any).sku; delete (invBody as any).locale;
  const p1 = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, {
    method: 'PUT', headers: H, body: JSON.stringify(invBody),
  });
  console.log('PUT inventory_item: ' + p1.status);
  if (p1.status >= 400) { console.log(await p1.text()); process.exit(1); }

  // description, whole offer resent so nothing else can drift
  const offBody: any = { ...offer, listingDescription: DESC };
  for (const k of ['offerId', 'sku', 'marketplaceId', 'format', 'listing', 'status']) delete offBody[k];
  const p2 = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + offer.offerId, {
    method: 'PUT', headers: H, body: JSON.stringify(offBody),
  });
  console.log('PUT offer: ' + p2.status);
  if (p2.status >= 400) { console.log(await p2.text()); process.exit(1); }

  const after = await liveTitleAndDesc(tok);
  console.log('\nverify title: ' + after.title);
  if (after.title !== TITLE) throw new Error('title did not take');
  if (after.price !== live.price) throw new Error('PRICE MOVED ' + live.price + ' -> ' + after.price);
  if (/1st Bowman/i.test(after.desc)) throw new Error('description still claims 1st Bowman');
  if (!/color match/i.test(after.desc)) throw new Error('color match line missing from description');
  console.log('verify price: $' + after.price + ' unchanged');
  console.log('verify description: 1st Bowman claim gone, color match present');

  const [row] = await sql`select notes from baseball_cards where id = ${ROW}`;
  if (row && !/color match/i.test(row.notes ?? '')) {
    await sql`update baseball_cards
      set notes = notes || ' | Team color match: orange parallel on a Marlins card (Michael, 2026-09-12). Listing title and description updated.',
          updated_at = now()
      where id = ${ROW}`;
    console.log('vault: note recorded on row ' + ROW);
  }
  await sql.end();
})();
