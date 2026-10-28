/**
 * Drop the F1 mega box listing from $124.99 to $109.99, and re-cut the Best
 * Offer ladder that the drop would otherwise break.
 *
 *   npx tsx scripts/reprice-f1-mega-1028.ts           # dry run, reads the listing
 *   npx tsx scripts/reprice-f1-mega-1028.ts --apply
 *
 * Michael, 2026-10-28: "do it", answering a recommendation to cut to $109.99.
 *
 * WHY $109.99. Five days live at $124.99 with 0 of 8 sold, while 38 single
 * sealed mega boxes were asking under him. Measured today off the Browse ask
 * book (`scripts/comp-f1-mega-1023.ts`): 104 single-box asks, floor $108.99,
 * median $130.00. On 2026-10-23 the same script read a $105 floor and a
 * $135.99 median, so the middle has softened about 4% while the bottom held.
 * Basis is $77.37/box, so at $109.99 he still nets roughly +$15/box.
 *
 * THE LADDER HAS TO MOVE WITH THE PRICE, and this is the part that is a
 * judgement call rather than an instruction. The live ladder is auto-accept
 * $120.00 and auto-decline $112.00, both of which sit ABOVE the new $109.99
 * ask. Left alone they are not merely stale, they are incoherent: eBay will
 * not take an auto-accept above the Buy It Now price, and a $112 auto-decline
 * would reject offers higher than the price anyone can just pay.
 *
 * The first attempt set auto-accept equal to the ask, so that nothing at all
 * was conceded beyond the price he approved. eBay refused it outright:
 * "The Best Offer Auto Accept Price must be less than the Buy It Now price."
 * It has to be strictly under, so the new ladder is the tightest one eBay
 * will take that still keeps the shape of the ladder he chose himself:
 *
 *   auto-accept  $104.99  4.5% under the ask. His own original ladder sat
 *                           7.7% under ($120.00 against a $129.99 ask), so
 *                           this concedes less ground than the one he set.
 *   auto-decline  $99.99  still about +$6/box if it ever cleared, so it is a
 *                           noise filter, not a floor he would regret.
 *
 * Anything between the two comes to him.
 *
 * Trading API, not Inventory, which is what makes a plain ReviseFixedPriceItem
 * work on this listing at all. Reads the listing back with GetItem afterwards:
 * a revise that returns Success is not evidence the listing says what it
 * should ([[reference_ebay_publish_verify_trading_api]]).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const OLD_PRICE = '124.99';
const NEW_PRICE = '109.99';
const NEW_ACCEPT = '104.99';
const NEW_DECLINE = '99.99';

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

async function userToken(): Promise<string> {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await retry(async () =>
    (
      await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')
            ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body:
          'grant_type=refresh_token&refresh_token=' +
          encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
          '&scope=' +
          encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
      })
    ).json()
  );
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function trading(tok: string, call: string, xml: string): Promise<string> {
  return retry(async () => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': call,
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
        'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'text/xml',
      },
      body: xml,
    });
    return r.text();
  });
}

function pick(xml: string, tag: string): string | null {
  return xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'))?.[1] ?? null;
}

function problems(xml: string): number {
  let n = 0;
  for (const m of xml.matchAll(
    /<Errors>[\s\S]*?<ShortMessage>([^<]*)<\/ShortMessage>[\s\S]*?<LongMessage>([^<]*)<\/LongMessage>[\s\S]*?<SeverityCode>(\w+)<\/SeverityCode>[\s\S]*?<\/Errors>/g
  )) {
    console.log(`  [${m[3]}] ${m[1]} :: ${m[2]}`);
    if (m[3] === 'Error') n++;
  }
  return n;
}

async function readItem(tok: string) {
  const xml = await trading(
    tok,
    'GetItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel>` +
      '</GetItemRequest>'
  );
  return {
    title: pick(xml, 'Title'),
    price: pick(xml, 'CurrentPrice'),
    qty: pick(xml, 'Quantity'),
    sold: pick(xml, 'QuantitySold'),
    status: pick(xml, 'ListingStatus'),
    accept: pick(xml, 'BestOfferAutoAcceptPrice'),
    decline: pick(xml, 'MinimumBestOfferPrice'),
  };
}

async function main() {
  const tok = await userToken();

  const before = await readItem(tok);
  console.log('before:', JSON.stringify(before));
  if (before.status !== 'Active') {
    console.log(`listing is ${before.status}, refusing to revise`);
    return;
  }
  if (before.price !== OLD_PRICE) {
    console.log(
      `expected the listing to be at $${OLD_PRICE} and it reads $${before.price}. ` +
        'Something else changed it; refusing to overwrite a price I did not expect.'
    );
    return;
  }

  console.log(`\nwould revise $${OLD_PRICE} -> $${NEW_PRICE}, qty ${before.qty} unchanged`);
  console.log(
    `  Best Offer accept  $${before.accept} -> $${NEW_ACCEPT}` +
      (Number(before.accept) > Number(NEW_PRICE) ? '   (was above the new ask)' : '')
  );
  console.log(
    `  Best Offer decline $${before.decline} -> $${NEW_DECLINE}` +
      (Number(before.decline) > Number(NEW_PRICE) ? '   (was above the new ask)' : '')
  );
  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    return;
  }

  const res = await trading(
    tok,
    'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<Item><ItemID>${ITEM_ID}</ItemID>` +
      `<StartPrice currencyID="USD">${NEW_PRICE}</StartPrice>` +
      '<ListingDetails>' +
      `<BestOfferAutoAcceptPrice currencyID="USD">${NEW_ACCEPT}</BestOfferAutoAcceptPrice>` +
      `<MinimumBestOfferPrice currencyID="USD">${NEW_DECLINE}</MinimumBestOfferPrice>` +
      '</ListingDetails>' +
      '</Item></ReviseFixedPriceItemRequest>'
  );
  console.log('\nack:', pick(res, 'Ack'));
  const bad = problems(res);
  if (bad > 0) {
    console.log(`${bad} error(s); not trusting this.`);
    return;
  }

  const after = await readItem(tok);
  console.log('after :', JSON.stringify(after));
  const ok =
    after.price === NEW_PRICE &&
    after.accept === NEW_ACCEPT &&
    after.decline === NEW_DECLINE;
  console.log(
    ok
      ? `\nVERIFIED: live at $${after.price}, qty ${after.qty}, ${after.sold} sold, ` +
          `offers auto-accept at $${after.accept} and auto-decline under $${after.decline}.`
      : `\nWARNING: eBay reports price $${after.price}, accept $${after.accept}, ` +
          `decline $${after.decline}. Not what was asked for; check before trusting this.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
