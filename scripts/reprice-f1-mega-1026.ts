/**
 * Drop the F1 mega box listing from $129.99 to $124.99.
 *
 *   npx tsx scripts/reprice-f1-mega-1026.ts           # dry run, reads the listing
 *   npx tsx scripts/reprice-f1-mega-1026.ts --apply
 *
 * Michael, 2026-10-26: "Reprice my f1 to 124.99 as well."
 *
 * Item 168812159614, the qty-8 2026 Topps F1 mega box listing built by
 * `scripts/list-f1-mega-1023.ts`. Trading API, not Inventory, which is what
 * makes a plain ReviseFixedPriceItem work here at all.
 *
 * ONLY the price moves. The Best Offer floors stay where they were, at
 * $120.00 auto-accept and $112.00 auto-decline, because he asked for a price
 * change and those are a separate decision about what he will take. Worth
 * him knowing the consequence though: at $124.99 the auto-accept sits $4.99
 * under the ask rather than $9.99 under, so offers now have to come much
 * closer to full price before they clear on their own. If he wants that
 * ladder re-cut too it is two constants here.
 *
 * Reads the listing back with GetItem afterwards and compares against what
 * was asked for. A revise that returns Success is not evidence the listing
 * says what it should; the Inventory API has lied about exactly this before.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const NEW_PRICE = '124.99';
const OLD_PRICE = '129.99';

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
  return xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1] ?? null;
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
  console.log(`Best Offer floors unchanged: accept $${before.accept}, decline $${before.decline}`);
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
  console.log(
    after.price === NEW_PRICE
      ? `\nVERIFIED: live at $${after.price}, qty ${after.qty}, ${after.sold} sold.`
      : `\nWARNING: eBay reports $${after.price}, not $${NEW_PRICE}. Check before trusting this.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
