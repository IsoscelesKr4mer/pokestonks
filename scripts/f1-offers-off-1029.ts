/**
 * Turn Best Offer OFF on the F1 mega box listing. Buy It Now only.
 *
 *   npx tsx scripts/f1-offers-off-1029.ts            # dry run
 *   npx tsx scripts/f1-offers-off-1029.ts --apply
 *
 * Michael, 2026-10-29 (voice): "I'm getting a million offers and I'm sick of
 * it. Take offers off. No offers. Buy it now only for the F1 boxes. That's my
 * typical policy. I noticed that when I turned off offers, people just buy it."
 *
 * So this is not just a cleanup of one listing, it is him restating a standing
 * preference: sealed product goes up Buy It Now only. The ladder I re-cut on
 * 10-28 ($104.99 accept / $99.99 decline) existed only because the price drop
 * forced a decision on it, and it is now moot.
 *
 * Disabling Best Offer closes any offers outstanding on the listing. That is
 * the point of the request, not a side effect to warn him about.
 *
 * Price and quantity are untouched: $109.99, 8 available. Sending
 * BestOfferEnabled false alone leaves the auto-accept and auto-decline values
 * stored but inert, and the read-back below checks that eBay actually reports
 * the listing as no longer taking offers rather than trusting the ack
 * ([[reference_ebay_publish_verify_trading_api]]).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const EXPECT_PRICE = '109.99';

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
            Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!,
          scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory',
        }).toString(),
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
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const i = xml.indexOf(open);
  if (i < 0) return null;
  const gt = xml.indexOf('>', i);
  const j = xml.indexOf(close, gt);
  if (gt < 0 || j < 0) return null;
  return xml.slice(gt + 1, j);
}

function problems(xml: string): number {
  let n = 0;
  let from = 0;
  for (;;) {
    const i = xml.indexOf('<Errors>', from);
    if (i < 0) break;
    const j = xml.indexOf('</Errors>', i);
    const block = xml.slice(i, j < 0 ? undefined : j);
    const sev = pick(block, 'SeverityCode');
    console.log(`  [${sev}] ${pick(block, 'ShortMessage')} :: ${pick(block, 'LongMessage')}`);
    if (sev === 'Error') n++;
    if (j < 0) break;
    from = j + 1;
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
  const total = Number(pick(xml, 'Quantity'));
  const sold = Number(pick(xml, 'QuantitySold'));
  return {
    status: pick(xml, 'ListingStatus'),
    price: pick(xml, 'CurrentPrice'),
    available: total - sold,
    bestOffer: pick(xml, 'BestOfferEnabled'),
    offerCount: pick(xml, 'BestOfferCount'),
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
  if (before.price !== EXPECT_PRICE) {
    console.log(
      `expected $${EXPECT_PRICE} and eBay reads $${before.price}. ` +
        'Something else changed it; refusing to touch a listing I do not recognise.'
    );
    return;
  }
  if (before.bestOffer === 'false') {
    console.log('Best Offer is already off. Nothing to do.');
    return;
  }

  console.log(
    `\nwould turn Best Offer OFF. Price stays $${before.price}, ` +
      `${before.available} available. ${before.offerCount ?? 0} offer(s) currently on it ` +
      'will be closed out by eBay.'
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
      '<BestOfferDetails><BestOfferEnabled>false</BestOfferEnabled></BestOfferDetails>' +
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
    after.bestOffer === 'false' && after.price === EXPECT_PRICE && after.available === before.available
      ? `\nVERIFIED: Buy It Now only at $${after.price}, ${after.available} available, no offers.`
      : `\nWARNING: eBay reports bestOffer ${after.bestOffer}, $${after.price}, ` +
          `${after.available} available. Not what was asked for; check before trusting this.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
