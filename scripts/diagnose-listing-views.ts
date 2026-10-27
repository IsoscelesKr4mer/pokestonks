/**
 * Why is a listing getting no views?
 *
 *   npx tsx scripts/diagnose-listing-views.ts <itemId> "<query a buyer types>" [more queries]
 *   npx tsx scripts/diagnose-listing-views.ts 168812159614 "2026 topps chrome formula 1 mega box"
 *
 * Read-only. Built 2026-10-27 for the F1 mega box, generalised because the
 * question recurs.
 *
 * "No views" has four unrelated causes and they need different fixes, so the
 * script answers them separately instead of guessing:
 *
 *   1. Is the listing broken?   -> GetItem: status, category, item specifics, UPC, photos.
 *   2. Is it even in the index? -> Browse search on its own exact title.
 *   3. Is it buried?            -> Best Match position across the whole field.
 *   4. Is it priced out?        -> delivered-price ladder of the live field.
 *
 * THREE TRAPS, each of which produced a wrong answer on the first run and is
 * now designed out:
 *
 *   - `DetailLevel ReturnAll` does NOT return item specifics. Without
 *     `IncludeItemSpecifics` a fully specced listing reads as having none,
 *     which looks exactly like the classic search-suppression bug. Send both.
 *   - Browse reports $0.00 shipping for CALCULATED listings when the request
 *     carries no buyer location. That made a field of ordinary buyer-pays
 *     sellers look like it was all free shipping, which would have argued for
 *     a shipping change he has banned outright. Always send
 *     X-EBAY-C-ENDUSERCTX with a real ZIP, and one far from the seller.
 *   - Rank must be read from the paged Best Match order, not from whether the
 *     item shows up in the first 100 hits. Absence from a page is not absence
 *     from the index.
 *
 * The Analytics traffic report (real impressions and CTR) needs
 * `sell.analytics.readonly`, which is NOT on the current refresh token; only
 * sell.inventory is consented. The script says so rather than silently
 * skipping it, because a 403 there is a missing consent, not a dead listing.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const ITEM_ID = process.argv[2];
const QUERIES = process.argv.slice(3);
if (!ITEM_ID) {
  console.log('usage: npx tsx scripts/diagnose-listing-views.ts <itemId> "<query>" [more]');
  process.exit(1);
}

/** A buyer far from Edmonds, so calculated shipping has to quote a real rate. */
const BUYER_ZIP = '10001';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const [kk, v] of Object.entries(o)) {
      if (kk === k && typeof v === 'string') return v;
      const f = fk(v, k);
      if (f) return f;
    }
  }
  return undefined;
}

const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
const basic = Buffer.from(
  fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')
).toString('base64');
const REFRESH = fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!;

async function retry<T>(f: () => Promise<T>): Promise<T> {
  let e: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await f();
    } catch (err) {
      e = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw e;
}

async function token(body: string): Promise<string | null> {
  const j: any = await retry(async () =>
    (
      await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + basic,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
    ).json()
  );
  return j.access_token ?? null;
}

const userToken = (scope: string) =>
  token(
    'grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(REFRESH) +
      '&scope=' +
      encodeURIComponent(scope)
  );

const appToken = () =>
  token(
    'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  );

const pick = (xml: string, tag: string): string | null =>
  xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;

async function main() {
  const utok = await userToken('https://api.ebay.com/oauth/api_scope/sell.inventory');
  const atok = await appToken();
  if (!utok || !atok) throw new Error('could not get tokens');

  const H = {
    Authorization: 'Bearer ' + atok,
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    'X-EBAY-C-ENDUSERCTX': `contextualLocation=country%3DUS%2Czip%3D${BUYER_ZIP}`,
  };

  // ------------------------------------------------- 1. is the listing broken
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': utok,
      'Content-Type': 'text/xml',
    },
    // IncludeItemSpecifics is NOT implied by ReturnAll. See the header note.
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel>` +
      '<IncludeItemSpecifics>true</IncludeItemSpecifics>' +
      '</GetItemRequest>',
  });
  const xml = await r.text();

  const title = pick(xml, 'Title');
  const catId = pick(xml, 'CategoryID') ?? pick(xml, 'PrimaryCategoryID');
  const seller = xml.match(/<Seller>[\s\S]*?<UserID>([^<]*)<\/UserID>/)?.[1];
  const price = Number(pick(xml, 'CurrentPrice') ?? 0);
  const photos = (xml.match(/<PictureURL>/g) ?? []).length;

  console.log('=== THE LISTING ===');
  console.log(`  ${title}  (${title?.length ?? 0}/80 chars)`);
  console.log(
    `  ${pick(xml, 'ListingStatus')}  $${price}  qty ${pick(xml, 'Quantity')}` +
      `  ${pick(xml, 'QuantitySold')} sold  started ${pick(xml, 'StartTime')?.slice(0, 10)}`
  );
  console.log(`  category ${catId}   seller ${seller}   photos ${photos}`);
  console.log(
    `  shipping ${pick(xml, 'ShippingType')}, handling ${pick(xml, 'DispatchTimeMax')}d` +
      `   best offer ${pick(xml, 'BestOfferEnabled')}`
  );
  if (photos < 6) console.log(`  ^ only ${photos} photos. eBay rewards 6+; this is free to fix.`);

  const aspects: Record<string, string> = {};
  for (const m of xml.matchAll(
    /<NameValueList>[\s\S]*?<Name>([^<]*)<\/Name>([\s\S]*?)<\/NameValueList>/g
  )) {
    aspects[m[1]] = [...m[2].matchAll(/<Value>([^<]*)<\/Value>/g)].map((v) => v[1]).join(' | ');
  }

  const tx = await fetch(
    'https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category' +
      `?category_id=${catId}`,
    { headers: { Authorization: 'Bearer ' + atok } }
  );
  const tj: any = await tx.json();
  const all: any[] = tj.aspects ?? [];
  const req = all.filter((a) => a.aspectConstraint?.aspectRequired);
  const missReq = req.filter((a) => !aspects[a.localizedAspectName]);
  console.log(
    `\n  item specifics: ${Object.keys(aspects).length} set, ` +
      `${missReq.length} of ${req.length} required missing` +
      (missReq.length ? ` -> ${missReq.map((a) => a.localizedAspectName).join(', ')}` : '')
  );
  console.log(`  UPC: ${aspects['UPC'] ?? pick(xml, 'UPC') ?? 'MISSING'}`);
  if (missReq.length)
    console.log('  ^ a missing REQUIRED aspect does suppress search placement. Fix that first.');

  // ------------------------------------------------- 2. is it in the index
  const ex = await fetch(
    'https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q=' +
      encodeURIComponent(title ?? ''),
    { headers: H }
  );
  const ej: any = await ex.json();
  const exPos = (ej.itemSummaries ?? []).findIndex((i: any) => i.legacyItemId === ITEM_ID);
  console.log('\n=== IS IT INDEXED? ===');
  console.log(
    exPos >= 0
      ? `  yes: position ${exPos + 1} on a search for its own exact title.`
      : '  NOT FOUND on its own exact title. That is a real indexing problem.'
  );

  // ------------------------------- 3 + 4. where it ranks, and the price field
  const field = new Map<string, any>();
  for (const q of QUERIES) {
    let pos = -1;
    let scanned = 0;
    let total = 0;
    for (let off = 0; off < 600; off += 200) {
      const s = await fetch(
        'https://api.ebay.com/buy/browse/v1/item_summary/search' +
          `?limit=200&offset=${off}&q=${encodeURIComponent(q)}`,
        { headers: H }
      );
      const j: any = await s.json();
      total = j.total ?? 0;
      const its: any[] = j.itemSummaries ?? [];
      if (!its.length) break;
      its.forEach((i, n) => {
        if (i.legacyItemId === ITEM_ID && pos < 0) pos = off + n + 1;
        field.set(i.itemId, i);
      });
      scanned += its.length;
      if (scanned >= total) break;
    }
    console.log(`\n=== BEST MATCH: "${q}" ===`);
    console.log(`  ${total} live listings; his position ${pos > 0 ? pos : `>${scanned}`}`);
    if (pos > 60)
      console.log('  ^ nobody pages that deep. This is the whole answer to "no views".');
  }

  // delivered-price ladder, with real shipping quotes
  const rows = [...field.values()]
    .filter((i) => i.buyingOptions?.includes('FIXED_PRICE'))
    .filter((i) => !/break|spot|random|pick\b|empty|lot of/i.test(i.title))
    .map((i) => {
      const so = i.shippingOptions?.[0];
      const ship = so?.shippingCost?.value !== undefined ? Number(so.shippingCost.value) : null;
      return {
        id: i.legacyItemId,
        p: Number(i.price?.value ?? 0),
        ship,
        type: so?.shippingCostType ?? '?',
        title: i.title as string,
      };
    })
    .filter((i) => i.ship !== null && i.p > price * 0.4 && i.p < price * 3)
    .map((i) => ({ ...i, del: i.p + i.ship! }))
    .sort((a, b) => a.del - b.del);

  const mine = rows.find((m) => m.id === ITEM_ID);
  console.log(`\n=== DELIVERED PRICE FIELD (to ZIP ${BUYER_ZIP}) ===`);
  console.log(`  ${rows.length} comparable live listings with a real shipping quote`);
  console.log(`  free shipping: ${rows.filter((m) => m.ship === 0).length} of ${rows.length}`);
  rows.slice(0, 12).forEach((m, n) =>
    console.log(
      `   ${String(n + 1).padStart(3)}. $${m.del.toFixed(2).padStart(7)} = ` +
        `${m.p.toFixed(2)} + ${m.ship!.toFixed(2)} ${m.type.padEnd(10)} ${m.title.slice(0, 44)}`
    )
  );
  if (mine) {
    console.log(
      `\n  HIS: $${mine.del.toFixed(2)} delivered ` +
        `(${mine.p.toFixed(2)} + ${mine.ship!.toFixed(2)}), rank ${rows.indexOf(mine) + 1} of ${rows.length}`
    );
    console.log(
      `  cheaper than his delivered price: ${rows.filter((m) => m.del < mine.del).length}`
    );
  }
  const d = rows.map((m) => m.del);
  if (d.length)
    console.log(
      `  field delivered: min $${d[0].toFixed(2)}  median $${d[Math.floor(d.length / 2)].toFixed(2)}`
    );

  // -------------------------------------------------- what cannot be answered
  const an = await userToken('https://api.ebay.com/oauth/api_scope/sell.analytics.readonly');
  console.log('\n=== REAL IMPRESSION DATA ===');
  console.log(
    an
      ? '  sell.analytics.readonly IS granted; wire up the traffic report.'
      : '  NOT AVAILABLE. sell.analytics.readonly is not consented on the refresh\n' +
          '  token, so actual impressions, views and CTR cannot be read. Everything\n' +
          '  above is inferred from the public search field instead.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
