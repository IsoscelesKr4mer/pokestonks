/**
 * The $50 Murakami Red RC Variation is showing the base card.
 *
 *   npx tsx scripts/fix-murakami-red-photos-0914.ts           # dry run
 *   npx tsx scripts/fix-murakami-red-photos-0914.ts --apply
 *
 * Michael: "wtf you have the wrong murakami photo on my red variation listed
 * for $50."
 *
 * He is right, and the SKU gives away how it happened. Two copies of #76 came
 * out of that box:
 *
 *   build index 1   Red Rookie Variation   IMG_2884 front, IMG_2903 back
 *   build index 43  plain base             IMG_3667 front, IMG_3679 back
 *
 * The listing is SKU BOWCH-76-43. It took its photos from index 43, so the
 * $50 listing for the red card has been showing the $7 base card the whole
 * time. The give away is the RC shield: red on IMG_2884, plain white on the
 * photo that is live now.
 *
 * Both correct photos were already uploaded to EPS back on 09-10 and are
 * sitting unused in scripts/_bow_eps.json. Nothing needs re-uploading, the
 * listing was just pointed at the wrong pair.
 *
 * The you-pick keeps IMG_3667/3679 on its own #76 variation. That one really
 * is the base card, so it was right all along.
 *
 * Inventory API listing, so photos live on the inventory item's
 * product.imageUrls. Only imageUrls is rewritten; price and title are read
 * back and asserted unchanged.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BOWCH-76-43';
const ITEM = '168680122981';
const ROW = 558;

const cache: Record<string, string> = JSON.parse(readFileSync('scripts/_bow_eps.json', 'utf8'));
const WANT = [cache['2884'], cache['2903']];   // front red RC shield, then back

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

async function live(tok: string) {
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
    sold: x.match(/<QuantitySold>(\d+)</)?.[1] ?? '0',
    pics: [...x.matchAll(/<PictureURL>([^<]+)</g)].map((m) => m[1]),
  };
}

(async () => {
  if (!WANT[0] || !WANT[1]) throw new Error('IMG_2884 / IMG_2903 are not in the EPS cache');
  const tok = await userToken();
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const before = await live(tok);
  console.log(before.title);
  console.log('$' + before.price + ' | sold ' + before.sold);
  console.log('\nlive now (the base card):');
  before.pics.forEach((p) => console.log('   ' + p));
  console.log('should be (the red card):');
  WANT.forEach((p) => console.log('   ' + p));
  if (Number(before.sold) > 0) throw new Error('this has sold, do not touch the photos');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const item: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, { headers: H })).json();
  if (!item.product) throw new Error('no inventory item for ' + SKU);
  const body = { ...item, product: { ...item.product, imageUrls: WANT } };
  delete (body as any).sku; delete (body as any).locale;
  const p = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  });
  console.log('\nPUT inventory_item: ' + p.status);
  if (p.status >= 400) { console.log(await p.text()); process.exit(1); }

  const after = await live(tok);
  console.log('verify photos now live:');
  after.pics.forEach((x) => console.log('   ' + x));
  const norm = (u: string) => u.split('?')[0];
  if (after.pics.length !== 2 || norm(after.pics[0]) !== norm(WANT[0]) || norm(after.pics[1]) !== norm(WANT[1]))
    throw new Error('photos did not take');
  if (after.price !== before.price) throw new Error('PRICE MOVED ' + before.price + ' -> ' + after.price);
  if (after.title !== before.title) throw new Error('title changed');
  console.log('verify: $' + after.price + ' and the title unchanged');

  await sql`update baseball_cards
    set photo_urls = ${JSON.stringify(WANT)}::jsonb,
        notes = notes || ' | Photos corrected 2026-09-14: the listing had been showing IMG_3667/3679, the plain base #76 from the same box, because SKU BOWCH-76-43 was built off build index 43 instead of index 1. Now on IMG_2884/2903, the red RC shield.',
        updated_at = now()
    where id = ${ROW}`;
  console.log('vault: row ' + ROW + ' photo_urls filled and the miss recorded');
  await sql.end();
})();
